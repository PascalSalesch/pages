import * as events from 'node:events'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as cmd from 'node:child_process'
import * as url from 'node:url'
import threads from 'node:worker_threads'

import getAllCodeFiles from '../utils/getAllCodeFiles.mjs'
import { getFormattedPathname } from '../utils/getPageInfo.mjs'
import clean from '../utils/clean.mjs'

import Page from './Page.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// asnyc function constructor
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

/**
 * Represents a collection of pages.
 */
export default class PageBuilder extends events.EventEmitter {
  /**
   * @type {Page[]} - An array of all pages that were created.
   */
  pages = []

  /**
   * @type {Object<string,string>} - Maps a url path to a page id
   */
  urlPaths = {}

  /**
   * @type {WorkloadManager} - A workload manager that can prioritize and queue workloads.
   */
  workloadManager = new WorkloadManager()

  /**
   * @type {Object<string,AsyncFunction>} - A map of event names to async listeners.
   */
  #asyncListeners = {}

  /**
   * @type {boolean|Promise} - Whether the PageBuilder is currently building pages.
   */
  #building = false

  /**
   * @type {boolean|Promise} - Whether the PageBuilder is currently loading.
   */
  #loading = false

  /**
   * Waits for the PageBuilder to finish loading.
   * @type {boolean|Promise}
   */
  get loading () {
    return this.#loading
  }

  /**
   * Creates an instance of PageBuilder.
   * @param {object} options - Options.
   * @param {string} [options.cwd=process.cwd()] - The current working directory.
   * @param {boolean} [options.verbose=false] - Whether to log verbose output.
   * @param {boolean} [options.continue=false] - Continue where the last build left off.
   * @param {function} [options.preflight] - A function that is called for each file before it is parsed with the intention to filter out files that should not be parsed as index pages.
   * @param {function} [options.page] - A function that is called for each page that is created.
   * @param {function} [options.meta] - A function that is called for each page that is created to add meta information to the page.
   * @param {string} [options.output] - The directory to output the pages to.
   * @param {string} [options.prefix] - A prefix that is added to all pathnames.
   * @param {string} [options.suffix] - A suffix that is added to all pathnames.
   * @param {string[]} [options.keep] - A list of files and directories that should not be deleted when the output directory is cleaned.
   */
  constructor (options = {}) {
    super()
    this.options = options
    this.cwd = options.cwd || process.cwd()
    this.output = options.output
    this.verbose = options.verbose || false
    this.prefix = (options.prefix && (options.prefix.startsWith('/') ? options.prefix : `/${options.prefix}`)) || ''
    this.suffix = options.suffix || ''
    this.keep = options.keep || []
    this.continue = options.continue || false

    if (this.verbose) {
      // preflight is emitted for all files that are read and can be used to filter out files that should not be parsed
      this.on('preflight', (event) => {
        console.log('[PageBuilder]', '[preflight]', `Starting to parse a new file: ${event.filePath}.`)
        console.log('[PageBuilder]', '[preflight]', 'To prevent this file from being parsed, call event.preventDefault() on the preflight event.')
      })

      // page is emitted for all pages that are created
      this.on('page', (event) => { console.log('[PageBuilder]', '[page]', 'A new page was created.', event.page.id) })

      // adding meta information to all pages
      this.on('meta', (event) => { console.log('[PageBuilder]', '[meta]', `Adding meta information to page ${event.page.id}.`) })
    }

    this.#loading = this.#load(options)
  }

  async #load (options) {
    // apply modules
    if (options.modules) {
      const modulesFolder = path.resolve(__dirname, '..', '..', 'modules')
      for (const module of options.modules) {
        if (this.verbose) console.log('[PageBuilder]', 'Loading module', module)

        const moduleExports = await (async () => {
          if (!module.startsWith('@pascalsalesch/pages/modules')) return await import(url.pathToFileURL(module).href)
          const modulePath = path.resolve(modulesFolder, ...(module.slice('@pascalsalesch/pages/modules/'.length).split('/')))
          const packageJsonFile = path.resolve(modulePath, 'package.json')
          const install = async (packageJsonFile) => {
            if (!(fs.existsSync(packageJsonFile))) return {}
            const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, { encoding: 'utf-8' }))
            if (!threads.isMainThread) return packageJson

            if (fs.existsSync(path.resolve(path.dirname(packageJsonFile), 'node_modules'))) return packageJson
            if (Object.keys(packageJson.dependencies || {}).length > 0) {
              cmd.execSync('npm install --omit=dev', { cwd: path.dirname(packageJsonFile), stdio: 'inherit' })
            }

            return packageJson
          }

          if (!(fs.existsSync(packageJsonFile))) return await import(url.pathToFileURL(modulePath).href)

          const packageJson = await install(packageJsonFile)
          const main = packageJson.main || 'index.mjs'
          const mainPath = path.resolve(modulePath, ...(main.split('/')))
          return await import(url.pathToFileURL(mainPath).href)
        })()

        for (const [eventName, listener] of Object.entries(moduleExports)) {
          if (eventName === 'default') continue
          if (typeof listener === 'function') this.onAsync(eventName, listener)
        }

        if (moduleExports.default) await moduleExports.default(this)
      }
    }

    // apply event configs
    const events = [
      'preflight',
      'page',
      'meta',
      // listeners for any rel extension, i.e.: `${eventName}OfCanonical`
      ...(Object.entries(options).filter(([eventName, listener]) => {
        return typeof listener === 'function' && (
          eventName.startsWith('getPathnames') ||
          eventName.startsWith('getVariables') ||
          eventName.startsWith('getContentAndSources') ||
          eventName.startsWith('getDependencies') ||
          eventName.startsWith('transform')
        )
      })).map(([eventName]) => eventName)
    ]
    for (const event of events) {
      if (options[event]) this.onAsync(event, options[event])
    }

    // internal events
    this.onAsync('build', ({ page }) => page.build(this))

    // done loading
    this.#loading = false
  }

  /**
   * Builds all pages from the directory specified in the constructor.
   * @returns {Promise<Page[]>} - An array of all pages that were created.
   */
  async build () {
    if (this.#loading) await this.#loading
    if (this.#building) return this.#building
    this.#building = this.#build()
    const result = await this.#building
    this.#building = false
    return result
  }

  /**
   * Internal method that builds all pages from the directory specified in the constructor.
   * @returns {Promise<Page[]>} - An array of all pages that were created.
   */
  async #build () {
    if (!this.output) throw new Error('No output directory specified')
    if (this.verbose) console.log('[PageBuilder]', 'Starting to build pages.')

    // read all files from cwd, except those in .gitignore
    const allFiles = await getAllCodeFiles(this.cwd)

    // emit preflight event for each file
    const files = []
    const outerHTML = {}
    for (const filePath of allFiles) {
      const event = {
        filePath,
        relativeFilePath: path.relative(this.cwd, filePath),
        outerHTML: '',
        pageBuilder: this,
        isDefaultPrevented: false,
        preventDefault: () => { event.isDefaultPrevented = true },
        setOuterHTML: (outerHTML) => { event.outerHTML = outerHTML }
      }

      await this.emit('preflight', event)

      if (event.isDefaultPrevented) {
        if (this.verbose) console.log('[PageBuilder]', '[preflight]', `File ${event.relativeFilePath} was prevented from being parsed.`)
        continue
      }

      files.push(filePath)
      outerHTML[filePath] = event.outerHTML
    }

    // create a Page instance for each file
    for (const filePath of files) {
      if (this.pages.find(page => page.id === filePath)) continue
      const page = new Page(filePath, { cwd: this.cwd })
      await this.emit('page', { page })
      this.pages.push(page)
    }

    // add meta information to each page
    for (const page of this.pages) {
      const event = {
        page,
        pageBuilder: this,
        outerHTML: outerHTML[page.id] || '',
        isDefaultPrevented: false,
        preventDefault: () => { event.isDefaultPrevented = true }
      }
      await this.emit('meta', event)
      if (!(event.isDefaultPrevented) && !(page.rel)) page.rel = 'canonical'
    }

    // create a clean output directory
    if (fs.existsSync(this.output) && !this.continue) await clean(this.output, { keep: this.keep })
    if (!(fs.existsSync(this.output))) fs.mkdirSync(this.output, { recursive: true })

    // build each page
    const pages = await Promise.all(this.pages.map((page) => this.emit('build', { page })))

    return pages
  }

  /**
   * Retrieves the pathnames of a page.
   * @param {Page} page - The page to retrieve the pathname for.
   * @returns {Promise<string[]>} - The pathnames of the page.
   */
  async getPathnames (page) {
    const event = {
      pathnames: [],
      page,
      pageBuilder: this,
      isDefaultPrevented: false,
      preventDefault: () => {
        if (event.pathnames.length === 0) throw new Error('Cannot prevent default action if pathnames are empty.')
        event.isDefaultPrevented = true
      }
    }
    const rel = `${page.rel[0].toUpperCase()}${page.rel.slice(1)}`
    if (this.verbose) console.log('[PageBuilder]', `[getPathnamesOf${rel}]`, `Retrieving pathnames for page ${page.id}`)

    await this.emit(`getPathnamesOf${rel}`, event)
    await this.emit('getPathnames', event)

    if (event.isDefaultPrevented) {
      event.pathnames = event.pathnames.map(pathname => getFormattedPathname(pathname, { pageBuilder: this, rel: page.rel }))
      return event.pathnames
    }

    return false
  }

  /**
   * Retrieves variables that are importable via `import { variables } from '@pascalsalesch/pages'`
   * @param {Page} page - The page.
   * @returns {Promise<string|false>} - The pathname of the page, or false if no pathname was set.
   */
  async getVariables (page) {
    const event = { variables: {}, page, pageBuilder: this }
    const rel = `${page.rel[0].toUpperCase()}${page.rel.slice(1)}`
    if (this.verbose) console.log('[PageBuilder]', `[getVariablesOf${rel}]`, `Retrieving variables for page ${page.id}`)
    await this.emit(`getVariablesOf${rel}`, event)
    await this.emit('getVariables', event)
    return event.variables
  }

  /**
   * Retrieves variables that are importable via `import { variables } from '@pascalsalesch/pages'`
   * @param {Page} page - The page.
   * @param {object} [options={}] - Options.
   * @param {object} [options.variables={}] - All static and dynamic path part values.
   * @returns {Promise<string|false>} - The pathname of the page, or false if no pathname was set.
   */
  async getContentAndSources (page, options = {}) {
    const event = {
      content: undefined,
      sources: [],
      page,
      pageBuilder: this,
      isDefaultPrevented: false,
      variables: options.variables,
      replace: options.replace,
      preventDefault: () => {
        if (event.pathnames.length === 0) throw new Error('Cannot prevent default action if pathnames are empty.')
        event.isDefaultPrevented = true
      }
    }
    const rel = `${page.rel[0].toUpperCase()}${page.rel.slice(1)}`
    if (this.verbose) console.log('[PageBuilder]', `[getContentAndSourcesOf${rel}]`, `Retrieving content and sources for page ${page.id}`)
    await this.emit(`getContentAndSourcesOf${rel}`, event)
    await this.emit('getContentAndSources', event)
    return { content: event.content, sources: event.sources }
  }

  /**
   * Retrieves the outerHTML that is including a dependency page.
   * @param {Page} page - The page.
   * @param {object} options - Options.
   * @param {string} options.urlPath - The url path of the dependency.
   * @param {string} options.content - The content of the dependency.
   * @param {object} options.variables - All static and dynamic path part values.
   * @returns {Promise<{dependencies:Array<{id:string,rel:string,outerHTML:string,src:string}>}>}
   */
  async getDependencies (page, { urlPath, content, variables, cwd }) {
    const event = { dependencies: [], page, pageBuilder: this, urlPath, content, variables, urlPaths: this.urlPaths, cwd }
    const rel = `${page.rel[0].toUpperCase()}${page.rel.slice(1)}`
    if (this.verbose) console.log('[PageBuilder]', `[getDependenciesOf${rel}]`, `Retrieving Dependencies for page ${page.id}`)
    await this.emit(`getDependenciesOf${rel}`, event)
    await this.emit('getDependencies', event)
    return { dependencies: event.dependencies }
  }

  /**
   *
   */
  async transform (page, { content, url }) {
    const event = { page, pageBuilder: this, content, url }
    const rel = `${page.rel[0].toUpperCase()}${page.rel.slice(1)}`
    if (this.verbose) console.log('[PageBuilder]', `[transformOf${rel}]`, `Preparing to write page ${page.id}`)
    await this.emit(`transformOf${rel}`, event)
    await this.emit('transform', event)
    return event.content
  }

  /**
   * Same as EventEmitter.on, but allows for async listeners.
   * @param {string} eventName - The name of the event.
   * @param {function|AsyncFunction} listener - The listener function.
   * @param  {...any} args - Additional arguments to pass to the listener.
   */
  on (eventName, listener, ...args) {
    if (listener instanceof AsyncFunction) {
      this.onAsync(eventName, listener, ...args)
    } else {
      super.on(eventName, listener, ...args)
    }
  }

  /**
   * Same as EventEmitter.on, but allows for async listeners.
   * @param {string} eventName - The name of the event.
   * @param {AsyncFunction} listener - The listener function.
   * @param  {...any} args - Additional arguments to pass to the listener.
   */
  onAsync (eventName, listener, ...args) {
    this.#asyncListeners[eventName] = this.#asyncListeners[eventName] || []
    this.#asyncListeners[eventName].push({ listener, args })
  }

  /**
   * Same as EventEmitter.off, but allows for async listeners.
   * @param {string} eventName - The name of the event.
   * @param {function|AsyncFunction} listener - The listener function.
   * @param  {...any} args - Additional arguments to pass to the listener.
   */
  off (eventName, listener, ...args) {
    this.#asyncListeners[eventName] = this.#asyncListeners[eventName].filter((e) => e.listener !== listener)
    return super.off(eventName, listener, ...args)
  }

  /**
   * Same as EventEmitter.emit, but allows await async listeners.
   * @param {string} eventName - The name of the event.
   * @param  {...any} args - Additional arguments to pass to the listener.
   * @returns {Promise<boolean>} - Whether the event had listeners.
   */
  async emit (eventName, ...args) {
    if (this.#asyncListeners[eventName]) {
      for (const event of this.#asyncListeners[eventName]) {
        await event.listener(...event.args, ...args)
      }
    }
    return super.emit(eventName, ...args) || this.#asyncListeners[eventName]?.length > 0
  }
}

class WorkloadManager {
  #prioritized = new Set()
  #isBusy = 0

  getBusyness () {
    return this.#isBusy
  }

  prioritize (id) {
    this.#prioritized.add(id)
  }

  next (id) {
    const callback = () => { this.#isBusy = this.#isBusy - 1 }
    const check = () => {
      const isPrioritized = this.#prioritized.has(id)
      if (isPrioritized || this.#isBusy === 0) {
        this.#isBusy = this.#isBusy + 1
        return callback
      }
    }

    const ready = check()
    if (ready) return ready

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const ready = check()
        if (ready) {
          clearInterval(interval)
          resolve(callback)
        }
      }, 300)
    })
  }
}
