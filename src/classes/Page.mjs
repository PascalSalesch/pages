import * as fs from 'node:fs'
import * as path from 'node:path'

import splitByTemplateLiterals from '../utils/splitByTemplateLiterals.mjs'
import importDynamicModule from '../utils/importDynamicModule.mjs'
import transformUrlParts from '../utils/transformUrlParts.mjs'
import getContent from '../utils/getContent.mjs'
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
  #getOrCreateSubpage (id, options = {}) {
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
  }

  /**
   * Adds a page to the list of pages that are embedding this page.
   * @param {reference} id - A reference to a page. This could be an absolute filepath, a relative filepath or a url.
   */
  addSubpage (id) {
    id = pageInfo.getId(id)
    if (id === this.id) return false
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
    const values = isAnyDynamic ? (await pageInfo.getHeadValues(this.id, pageBuilder)) : {}
    const promises = []
    for (const pathname of pathnames) {
      const isDynamic = !!(pathname.find((path) => path.type === 'dynamic'))
      if (!isDynamic) {
        const path = pathname.reduce((path, pathPart) => { return path + pathPart.value }, '')
        const pathnameInfo = pageInfo.getPathname(path, pagesWithSameRel, { rel: this.rel, pageBuilder })
        const buildPromise = this.#buildPath(pathnameInfo, { pageBuilder, variables: { allUrlParts: path, urlParts: [] } })
        promises.push(buildPromise)
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
        const dynamicVariables = pathname.reduce((dynamicVariables, pathPart, index) => {
          if (pathPart.type === 'dynamic') dynamicVariables[`\${${pathPart.value}}`] = variables[index]
          return dynamicVariables
        }, {})

        promises.push(this.#buildPath(pageInfo.getPathname(path, pagesWithSameRel, { rel: this.rel, pageBuilder }), {
          pageBuilder,
          variables: {
            allUrlParts: variables,
            urlParts: Object.values(dynamicVariables)
          },
          replace: dynamicVariables
        }))
      }
    }

    await Promise.all(promises)
  }

  /**
   * Builds a path.
   * @param {string} urlPath - The path to the page.
   * @param {object} options - Options.
   * @param {import('./PageBuilder.mjs').default} options.pageBuilder - The PageBuilder instance.
   * @param {object} options.variables - All static and dynamic path part values.
   * @param {object} [options.replace={}] - The values to replace in the content.
   */
  async #buildPath (urlPath, options = {}) {
    // add path to page builder
    options.pageBuilder.urlPaths[urlPath] = this.id

    // get content and sources
    options.variables = Object.assign(options.variables, options.pageBuilder.getVariables(this))
    const { content, sources } = await (async () => {
      const pageBuilderResult = await options.pageBuilder.getContentAndSources(this, { variables: options.variables, replace: options.replace })
      if (pageBuilderResult.content) return pageBuilderResult
      return pageInfo.getContentAndSources(this)
    })()

    // add files that modify the content as dependencies.
    this.#sources = [...new Set([...this.#sources, ...sources])]

    // Create sub-pages
    const { dependencies } = await options.pageBuilder.getDependencies(this, { urlPath, content, variables: options.variables })
    for (const { id, rel } of dependencies) {
      const page = this.#getOrCreateSubpage(id, { rel, cwd: options.pageBuilder.cwd, pageBuilder: options.pageBuilder })
      this.addSubpage(page.id)
    }

    // create the file content
    let fileContent = dependencies.length ? await getContent(content) : content

    // Wait for sub-pages to be build
    for (const id of this.getSubpages()) {
      const page = Page.pages[pageInfo.getId(id)]
      if (!page) throw new Error(`Page with id ${id} does not exist`)

      // add the page to the page builder
      const pageBuilderPage = options.pageBuilder.pages.find((page) => page.id === id)
      if (!pageBuilderPage) options.pageBuilder.pages.push(page)
    }

    // wait for the urlPath to be available for all sub-pages.
    // this works with circular dependencies because `urlPaths` is set before the build is done
    const subpageBuildPromises = []
    for (const { id } of dependencies) {
      const urlPaths = Object.values(options.pageBuilder.urlPaths).find(urlId => urlId === id)
      if (urlPaths) continue
      const page = options.pageBuilder.pages.find((page) => page.id === id)
      const build = page.getBuildProgress(options.pageBuilder)
      subpageBuildPromises.push(build)
    }
    await Promise.all(subpageBuildPromises)

    // replace the dependencies src with the url path
    const variableValues = Object.values(options.variables).flat().filter((v) => typeof v === 'string') || []
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const { id, src, outerHTML } of dependencies) {
      const urlPaths = Object.entries(options.pageBuilder.urlPaths).filter(([_key, value]) => value === id)
      if (urlPaths.length === 0) throw new Error(`Page with id ${id} has not been build, yet.`)

      // find the path that has more variable values in the url
      const [urlPath] = urlPaths.sort((a, b) => {
        const aSrc = a[0].includes(src)
        const bSrc = b[0].includes(src)
        if (aSrc && !bSrc) return -1
        if (!aSrc && bSrc) return 1
        const aCount = variableValues.map(value => a[0].split(value).length - 1).reduce((current, next) => current + next, 0)
        const bCount = variableValues.map(value => b[0].split(value).length - 1).reduce((current, next) => current + next, 0)
        return bCount - aCount
      })[0]

      // securely replace the src, unless the html has been automatically adjusted
      fileContent = fileContent.replaceAll(outerHTML, outerHTML.replaceAll(src, urlPath))
      const regex = new RegExp(`(src|href|action|data-src)=["']${escapeRegExp(src)}["']`, 'gi')
      fileContent = fileContent.replace(regex, `$1="${urlPath}"`)

      // securely replace the srcset, unless the html has been automatically adjusted
      if (outerHTML.includes('srcset')) {
        const regex = new RegExp(`srcset=["']([^"']*)${escapeRegExp(src)}([^"']*)["']`, 'gi')
        fileContent = fileContent.replace(regex, `srcset="$1${urlPath}$2"`)
      }
    }

    // emit event to modify the content
    fileContent = await options.pageBuilder.transform(this, { content: fileContent, url: urlPath })

    // write the file
    const output = path.resolve(options.pageBuilder.output, ...urlPath.split('/'))
    if (options.pageBuilder.verbose) console.log(`[Page] Writing ${urlPath} to ${output}`)
    if (!fs.existsSync(path.dirname(output))) await fs.promises.mkdir(path.dirname(output), { recursive: true })
    if (typeof fileContent === 'string') {
      await fs.promises.writeFile(output, fileContent, { encoding: 'utf-8' })
    } else {
      // write file from ReadableStream
      const writeStream = fs.createWriteStream(output)
      fileContent.pipe(writeStream)
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })
    }
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
