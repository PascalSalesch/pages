import * as path from 'node:path'

import threads from 'node:worker_threads'

import Path from './Path.mjs'

import splitByTemplateLiterals from '../utils/splitByTemplateLiterals.mjs'
import importDynamicModule from '../utils/importDynamicModule.mjs'
import transformUrlParts from '../utils/transformUrlParts.mjs'
import * as pageInfo from '../utils/getPageInfo.mjs'

/**
 * @typedef {string} reference - A reference to a page. This could be a filepath or the outerHTML of a page embedded in another page.
 */

export default class Page {
  /**
   * @type {Object<string, Page>} - A list of all pages.
   */
  static pages = {}

  /**
   * @type {string} - The absolute path to the page.
   */
  #id = null

  /**
   * @property {string} id - The absolute path to the page.
   */
  get id () { return this.#id }

  /**
   * @type {string} - The purpose of the page.
   */
  #rel = null

  /**
   * @property {string} rel - The purpose of the page.
   */
  get rel () { return this.#rel }

  /**
   * @type {function} - A setter for the purpose of the page.
   * @param {string} value - The purpose of the page.
   */
  set rel (value) {
    if (this.#rel) throw new Error(`The purpose of page ${this.id} has already been set to ${this.#rel}`)
    this.#rel = value
  }

  /**
   * @type {Object<import('./PageBuilder.mjs').default, Promise>} - A list of promises that resolve when the page has been built by the given PageBuilder instance.
   */
  #buildPromise = {}

  /**
   * Ensures that `--watch` will update previously build pages, as well.
   * @type {string[]} - A list of pathnames that have been used to build this page.
   */
  #pathnamesHistory = []

  /**
   * @type {string[]} - A list of ids of the files that modify the content of this page.
   */
  #sources = []

  /**
   * @type {string[]} - A list of ids of the pages that this page is embedded in.
   */
  #subpages = []

  /**
   * @param {string} id - The id of the dependency.
   * @param {object} [options={}] - Options.
   * @param {string} [options.rel] - The purpose of the dependency.
   * @param {string} [options.cwd] - The current working directory.
   * @param {import('./PageBuilder.mjs').default} [options.pageBuilder] - The PageBuilder instance.
   * @returns {Page} - The dependency.
   */
  getOrCreateSubpage (id, options = {}) {
    id = pageInfo.getId(id, { cwd: path.dirname(this.id), pageBuilder: options.pageBuilder })

    const page = Page.pages[id]
    if (page) {
      if (options.rel && !page.rel) page.rel = options.rel
      return page
    }

    const newPage = new Page(id, { cwd: options.cwd })
    if (options.rel) newPage.rel = options.rel
    return newPage
  }

  /**
   * Creates an instance of Page.
   * @param {reference} ref - A reference to a page. This could be an absolute filepath, a relative filepath or a url.
   */
  constructor (ref, options = {}) {
    this.#id = pageInfo.getId(ref, options)
    if (Page.pages[this.#id]) throw new Error(`Page with id ${this.#id} already exists`)
    Page.pages[this.#id] = this
  }

  /**
   * Adds a file to the list of files that modify the content of this page.
   * @param {string} source - The filepath of the file that modifies the content of this page.
   */
  addSource (source) {
    if (this.#sources.indexOf(source) === -1) this.#sources.push(source)
    if (!(threads.isMainThread)) threads.parentPort.postMessage({ type: 'addSource', addSource: [source] })
  }

  /**
   * Adds a page to the list of pages that are embedding this page.
   * @param {reference} id - A reference to a page. This could be an absolute filepath, a relative filepath or a url.
   */
  addSubpage (id) {
    id = pageInfo.getId(id)
    if (id === this.id) return false
    if (!(threads.isMainThread)) threads.parentPort.postMessage({ type: 'addSubpage', addSubpage: [id] })
    if (!(id in Page.pages)) throw new Error(`Page with id ${id} does not exist`)
    if (this.#subpages.indexOf(id) === -1) {
      this.#subpages.push(id)
      return true
    } else {
      return false
    }
  }

  /**
   * Returns a list of ids of the pages that are embedded in this page.
   * @returns {string[]} - A list of ids of the pages that are embedded in this page.
   */
  getSubpages () {
    return [...this.#subpages]
  }

  /**
   * Returns a list of files that modify the content of this page.
   * @returns {string[]} - A list of ids of the files that modify the content of this page.
   */
  getSources () {
    return [...this.#sources]
  }

  /**
   * Returns a promise that resolves when the page has been built by the given PageBuilder instance.
   * @param {import('./PageBuilder.mjs').default} pageBuilder - The PageBuilder instance.
   * @returns {Promise} - A promise that resolves when the page has been built by the given PageBuilder instance.
   */
  getBuildProgress (pageBuilder) {
    const progress = this.#buildPromise[getPageBuilderId(pageBuilder)]
    if (progress) return progress
    return this.build(pageBuilder)
  }

  /**
   * Builds the page.
   * @param {import('./PageBuilder.mjs').default} pageBuilder - The PageBuilder instance.
   */
  build (pageBuilder) {
    this.#buildPromise[getPageBuilderId(pageBuilder)] = this.#build(pageBuilder)
    return this.#buildPromise[getPageBuilderId(pageBuilder)]
  }

  /**
   * Builds the page.
   * @param {import('./PageBuilder.mjs').default} pageBuilder - The PageBuilder instance.
   */
  async #build (pageBuilder) {
    if (!(threads.isMainThread)) return

    const pagesWithSameRel = pageBuilder.pages.filter(page => page.rel === this.rel).map(page => page.id)
    const pathnamesList = (await pageBuilder.getPathnames(this) || [pageInfo.getPathname(this.id, pagesWithSameRel, { pageBuilder })])
      .concat(this.#pathnamesHistory)
      .filter((pathname, index, pathnames) => pathnames.indexOf(pathname) === index)
    this.#pathnamesHistory = pathnamesList.filter(pathname => pathname.indexOf('${') === -1)
    const pathnames = pathnamesList.map(pathname => {
      if (pathname.indexOf('${') !== -1) {
        const parts = splitByTemplateLiterals(pathname)
        return parts
      } else {
        return [{
          type: 'static',
          value: pathname
        }]
      }
    })

    const isAnyDynamic = !!(pathnames.some(pathname => pathname.find((path) => path.type === 'dynamic')))
    const values = isAnyDynamic ? (await pageInfo.getUrlValues(this.id, pageBuilder)) : {}
    const workload = []
    for (const pathname of pathnames) {
      const isDynamic = !!(pathname.find((path) => path.type === 'dynamic'))
      if (!isDynamic) {
        const path = pathname.reduce((path, pathPart) => { return path + pathPart.value }, '')
        const urlPath = pageInfo.getPathname(path, pagesWithSameRel, { rel: this.rel, pageBuilder })
        pageBuilder.urlPaths[urlPath] = this.id
        workload.push({ urlPath, variables: { allUrlParts: path, urlParts: [] } })
        continue
      }

      // evaluate dynamic variables
      const urlPartsEvalOptions = { cwd: pageBuilder.cwd, dir: path.dirname(this.id), fileref: this.id }
      const urlParts = Object.values(await importDynamicModule(`
        ${Object.entries(values).map(([key, value]) => `const ${key} = ${JSON.stringify(value)}`).join('\n')}
        ${pathname.map((pathPart, index) => `export const urlPart${index} = ${(pathPart.type !== 'dynamic') ? `'${pathPart.value}'` : pathPart.value}`).join('\n')}
      `, urlPartsEvalOptions)).map((part, i, urlParts) => {
        // if the previous part ends with a slash remove all beginning slashes
        if (typeof part !== 'string' || !(part.startsWith('/') || i === 0)) return part
        const previous = urlParts[i - 1]
        if (typeof previous === 'string' && previous.endsWith('/')) return part.replace(/^[/]+/g, '')
        return part
      })

      // build all possible paths
      const pathnames = transformUrlParts(urlParts)
      for (const { path, variables } of pathnames) {
        const urlParts = {}
        const dynamicVariables = {}
        for (const index in pathname) {
          const pathPart = pathname[index]
          if (pathPart.type !== 'dynamic') continue
          dynamicVariables[`\${${pathPart.value}}`] = variables[index]
          urlParts[pathPart.value] = variables[index]
        }

        const urlPath = pageInfo.getPathname(path, pagesWithSameRel, { rel: this.rel, pageBuilder })
        pageBuilder.urlPaths[urlPath] = this.id
        workload.push({
          urlPath,
          variables: {
            allUrlParts: variables,
            urlParts
          },
          replace: dynamicVariables
        })
      }
    }

    const callback = await pageBuilder.workloadManager.next(this.id)

    // prepare the data for the workers
    const pageBuilderData = JSON.parse(JSON.stringify(pageBuilder))
    const pageData = { id: this.id, rel: this.rel }
    const pagePath = new Path({ workload, pageBuilder, pageBuilderData, page: this, pageData })

    // build the page
    await pagePath.build()
    callback()
  }
}

/**
 * Returns the id of the given PageBuilder instance.
 * @param {import('./PageBuilder.mjs').default} pageBuilder - The PageBuilder instance.
 * @returns {string} - The id of the given PageBuilder instance.
 */
function getPageBuilderId (pageBuilder) {
  return pageBuilder.cwd + pageBuilder.output
}
