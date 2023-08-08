export const id = 988;
export const ids = [988];
export const modules = {

/***/ 17320:
/***/ ((module) => {

function webpackEmptyAsyncContext(req) {
	// Here Promise.resolve().then() is used instead of new Promise() to prevent
	// uncaught exception popping up in devtools
	return Promise.resolve().then(() => {
		var e = new Error("Cannot find module '" + req + "'");
		e.code = 'MODULE_NOT_FOUND';
		throw e;
	});
}
webpackEmptyAsyncContext.keys = () => ([]);
webpackEmptyAsyncContext.resolve = webpackEmptyAsyncContext;
webpackEmptyAsyncContext.id = 17320;
module.exports = webpackEmptyAsyncContext;

/***/ }),

/***/ 66925:
/***/ ((module) => {

function webpackEmptyAsyncContext(req) {
	// Here Promise.resolve().then() is used instead of new Promise() to prevent
	// uncaught exception popping up in devtools
	return Promise.resolve().then(() => {
		var e = new Error("Cannot find module '" + req + "'");
		e.code = 'MODULE_NOT_FOUND';
		throw e;
	});
}
webpackEmptyAsyncContext.keys = () => ([]);
webpackEmptyAsyncContext.resolve = webpackEmptyAsyncContext;
webpackEmptyAsyncContext.id = 66925;
module.exports = webpackEmptyAsyncContext;

/***/ }),

/***/ 87927:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "getDependenciesOfCanonical": () => (/* binding */ getDependenciesOfCanonical),
/* harmony export */   "getPathnamesOfCanonical": () => (/* binding */ getPathnamesOfCanonical),
/* harmony export */   "meta": () => (/* binding */ meta),
/* harmony export */   "modules": () => (/* binding */ modules),
/* harmony export */   "output": () => (/* binding */ output),
/* harmony export */   "port": () => (/* binding */ port),
/* harmony export */   "prefix": () => (/* binding */ prefix),
/* harmony export */   "preflight": () => (/* binding */ preflight),
/* harmony export */   "suffix": () => (/* binding */ suffix),
/* harmony export */   "verbose": () => (/* binding */ verbose)
/* harmony export */ });
/* harmony import */ var node_fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(87561);
/* harmony import */ var node_readline__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(51747);
/* harmony import */ var node_os__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(70612);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(49411);
/* harmony import */ var jsdom__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(46123);
/* harmony import */ var _src_utils_getPageInfo_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(96162);









/**
 * @fileoverview This file exports all overwritable functionality of the pages module.
 */

/**
 * @type {string} - Where to output the pages.
 */
const output = node_path__WEBPACK_IMPORTED_MODULE_3__.resolve(node_os__WEBPACK_IMPORTED_MODULE_2__.tmpdir(), `pages-${(new Date()).toISOString().substring(0, 10).replaceAll('-', '')}`)

/**
 * @type {number} - The port to use for the dev server.
 */
const port = 8080

/**
 * @type {string} - The prefix to use for all paths. The prefix affects the build location and the HTML of the pages.
 */
const prefix = '/'

/**
 * @type {string} - The suffix (before extensions) to use for all paths. The suffix affects the build location and the HTML of the pages.
 */
const suffix = ''

/**
 * @type {boolean} - Whether or not to print verbose output.
 */
const verbose = false

/**
 * @type {string[]} - The modules to use.
 */
const modules = [
  '@pascalsalesch/pages/modules/css-tailwind',
  '@pascalsalesch/pages/modules/mjs-rollup',
  '@pascalsalesch/pages/modules/html-render',
  '@pascalsalesch/pages/modules/manifest-icons'
]

/**
 * A function that is called for each file before it is parsed with the intention to filter out files that should not be parsed as index pages.
 * @param {object} event - The event object.
 * @param {string} event.filepath - The path to the file.
 * @param {boolean} event.isDefaultPrevented - Whether the default action has been prevented.
 * @param {function} event.preventDefault - A function that prevents the default action.
 */
async function preflight ({ filePath, relativeFilePath, preventDefault, isDefaultPrevented }) {
  if (isDefaultPrevented) return
  if (!(filePath.endsWith('.html'))) return preventDefault()

  let lineNumber = 0
  const stream = node_fs__WEBPACK_IMPORTED_MODULE_0__.createReadStream(filePath)
  const rl = node_readline__WEBPACK_IMPORTED_MODULE_1__.createInterface({ input: stream })
  for await (const line of rl) {
    lineNumber++

    // make sure the file starts with <html
    if (lineNumber === 1 && !line.startsWith('<html')) {
      stream.close()
      return preventDefault()
    }

    // make sure the file contains a canonical link
    if (line.match(/<link[^>]+rel=['"]canonical['"]/i) && line.match(/<link[^>]+href=['"]/i)) {
      stream.close()
      return
    }
  }
  stream.close()

  // empty files should not be parsed
  if (lineNumber === 0) return preventDefault()

  // warn about missing canonical link
  console.warn(`[PageBuilder] [preflight] File ${relativeFilePath} does not contain a canonical link.`)
}

/**
 * Sets the rel (how to parse the file) of the page. From the outerHTML of the including tag.
 * @param {object} event - The event object.
 * @param {import('./src/classes/Page.mjs').default} event.page - The page object.
 * @param {string} [event.outerHTML=''] - The outerHTML of the page.
 */
async function meta ({ page, outerHTML = '', isDefaultPrevented }) {
  if (isDefaultPrevented) return
  if (page.rel) return

  outerHTML = outerHTML.toLowerCase()

  // canonical, stylesheet, manifest, icon
  if (outerHTML.startsWith('<link')) {
    if (outerHTML.includes('canonical')) {
      page.rel = 'canonical'
      return
    }
    if (outerHTML.includes('stylesheet')) {
      page.rel = 'stylesheet'
      return
    }
    if (outerHTML.includes('manifest')) {
      page.rel = 'manifest'
      return
    }
    if (outerHTML.includes('icon')) {
      page.rel = 'icon'
      return
    }
    if (outerHTML.includes('apple-touch-icon')) {
      page.rel = 'icon'
      return
    }
  }

  // script
  if (outerHTML.startsWith('<script')) {
    page.rel = 'script'
    return
  }

  // image
  if (outerHTML.startsWith('<img')) {
    page.rel = 'image'
    return
  }

  // source
  if (outerHTML.startsWith('<source')) {
    page.rel = 'source'
    return
  }

  // default to source
  page.rel = 'source'
}

/**
 * Sets the pathname.
 * @param {object} event - The event object.
 * @param {import('./src/classes/Page.mjs').default} event.page - The page object.
 * @param {string[]} [event.pathnames] - The pathname of the page.
 * @param {function} event.preventDefault - A function that prevents the default action.
 * @param {boolean} event.isDefaultPrevented - Whether the default action has been prevented.
 */
async function getPathnamesOfCanonical (event) {
  const stream = node_fs__WEBPACK_IMPORTED_MODULE_0__.createReadStream(event.page.id)
  const rl = node_readline__WEBPACK_IMPORTED_MODULE_1__.createInterface({ input: stream })
  for await (const line of rl) {
    if (line.match(/<link[^>]+rel=['"]canonical['"]/i) && line.match(/<link[^>]+href=['"]/i)) {
      const pathname = line.match(/<link[^>]+href=['"]([^'"]+)['"]/i)[1]
      event.pathnames.push(pathname)
    }
  }
  stream.close()

  if (event.pathnames.length) {
    event.preventDefault()
  }
}

/**
 * Adds the Dependencies of the page.
 * @param {object} event - The event object.
 * @param {Array<{id:string,rel:string}>} event.dependencies - The Dependencies of the page.
 * @param {import('./src/classes/Page.mjs').default} event.page - The page object.
 * @param {string} event.content - The content of the page.
 * @param {object} event.variables - All the variables.
 * @param {object} event.urlPaths - Maps url paths to page ids.
 */
async function getDependenciesOfCanonical (event) {
  // create a dom from the content
  const document = (new jsdom__WEBPACK_IMPORTED_MODULE_4__/* .JSDOM */ .wC(event.content)).window.document
  const tags = [
    ...document.querySelectorAll('*[src]'),
    ...document.querySelectorAll('*[srcset]'),
    ...document.querySelectorAll('*[href]'),
    ...document.querySelectorAll('*[action]'),
    ...document.querySelectorAll('*[data-src]')
  ]

  // find the source and its type
  for (const tag of tags) {
    const outerHTML = tag.outerHTML
    const sources = ['src', 'href', 'action', 'data-src'].map(attr => tag.getAttribute(attr))
    const srcset = tag.getAttribute('srcset') ? tag.getAttribute('srcset').split(',').map(s => s.trim().split(' ')[0]) : []
    for (const src of [...sources, ...srcset].filter((v, i, a) => v && a.indexOf(v) === i)) {
      // skip external urls
      if (src.includes('://')) continue

      // known Dependencies should use their rel value
      const dependencyList = [
        src, `${src}.html`, `${src}index.html`, `${src}/`, `${src}/index.html`,
        // incase prefix is not defined, it defaults to '/', so remove it here
        `${src}${event.pageBuilder.suffix || ''}.html`,
        `${src}index${event.pageBuilder.suffix || ''}.html`,
        `${src}/index${event.pageBuilder.suffix || ''}.html`,
        // in case both is defined
        `${event.pageBuilder.prefix || ''}${src}${event.pageBuilder.suffix || ''}.html`,
        `${event.pageBuilder.prefix || ''}${src}index${event.pageBuilder.suffix || ''}.html`,
        `${event.pageBuilder.prefix || ''}${src}/index${event.pageBuilder.suffix || ''}.html`,
        // in case a variable is beginning with a slash
        `${event.pageBuilder.prefix + '/'}${src}${event.pageBuilder.suffix || ''}.html`,
        `${event.pageBuilder.prefix + '/'}${src}index${event.pageBuilder.suffix || ''}.html`,
        `${event.pageBuilder.prefix + '/'}${src}/index${event.pageBuilder.suffix || ''}.html`
      ]

      const dependency = dependencyList.find(id => event.urlPaths[id])

      if (dependency) {
        event.dependencies.push({ id: event.urlPaths[dependency], outerHTML, src })
        continue
      }

      const id = (0,_src_utils_getPageInfo_mjs__WEBPACK_IMPORTED_MODULE_5__/* .getId */ .zv)(src, { cwd: event.cwd || node_path__WEBPACK_IMPORTED_MODULE_3__.dirname(event.page.id), urlPaths: event.urlPaths, pageBuilder: event.pageBuilder })
      const page = {}
      await meta({ page, outerHTML })
      if (page.rel) event.dependencies.push({ id, rel: page.rel, outerHTML, src })
    }
  }
}


/***/ }),

/***/ 88368:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Z": () => (/* binding */ PageBuilder)
/* harmony export */ });
/* harmony import */ var node_events__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(15673);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(49411);
/* harmony import */ var node_fs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(87561);
/* harmony import */ var node_child_process__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(17718);
/* harmony import */ var _utils_getAllCodeFiles_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(56130);
/* harmony import */ var _utils_getPageInfo_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(96162);
/* harmony import */ var _Page_mjs__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(65690);










// asnyc function constructor
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

/**
 * Represents a collection of pages.
 */
class PageBuilder extends node_events__WEBPACK_IMPORTED_MODULE_0__.EventEmitter {
  /**
   * @type {Page[]} - An array of all pages that were created.
   */
  pages = []

  /**
   * @type {Object<string,string>} - Maps a url path to a page id
   */
  urlPaths = {}

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
   * Creates an instance of PageBuilder.
   * @param {object} options - Options.
   * @param {string} [options.cwd=process.cwd()] - The current working directory.
   * @param {boolean} [options.verbose=false] - Whether to log verbose output.
   * @param {function} [options.preflight] - A function that is called for each file before it is parsed with the intention to filter out files that should not be parsed as index pages.
   * @param {function} [options.page] - A function that is called for each page that is created.
   * @param {function} [options.meta] - A function that is called for each page that is created to add meta information to the page.
   * @param {string} [options.output] - The directory to output the pages to.
   */
  constructor (options = {}) {
    super()
    this.cwd = options.cwd || process.cwd()
    this.output = options.output
    this.verbose = options.verbose || false
    this.prefix = (options.prefix && (options.prefix.startsWith('/') ? options.prefix : `/${options.prefix}`)) || ''
    this.suffix = options.suffix || ''

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
      const modulesFolder = node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(node_path__WEBPACK_IMPORTED_MODULE_1__.dirname(new URL(import.meta.url).pathname), '..', '..', 'modules')
      for (const module of options.modules) {
        if (this.verbose) console.log('[PageBuilder]', 'Loading module', module)

        const moduleExports = await (async () => {
          if (!module.startsWith('@pascalsalesch/pages/modules')) return await __webpack_require__(17320)(module)
          const modulePath = node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(modulesFolder, ...(module.slice('@pascalsalesch/pages/modules/'.length).split('/')))
          const packageJsonFile = node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(modulePath, 'package.json')
          const install = async (packageJsonFile) => {
            if (!(node_fs__WEBPACK_IMPORTED_MODULE_2__.existsSync(packageJsonFile))) return {}
            const packageJson = JSON.parse(node_fs__WEBPACK_IMPORTED_MODULE_2__.readFileSync(packageJsonFile, { encoding: 'utf-8' }))

            if (node_fs__WEBPACK_IMPORTED_MODULE_2__.existsSync(node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(node_path__WEBPACK_IMPORTED_MODULE_1__.dirname(packageJsonFile), 'node_modules'))) return packageJson
            if (Object.keys(packageJson.dependencies || {}).length > 0) {
              await node_child_process__WEBPACK_IMPORTED_MODULE_3__.exec('npm install --production', { cwd: node_path__WEBPACK_IMPORTED_MODULE_1__.dirname(packageJsonFile) })
            }

            return packageJson
          }

          if (!(node_fs__WEBPACK_IMPORTED_MODULE_2__.existsSync(packageJsonFile))) return await __webpack_require__(17320)(modulePath)

          const packageJson = await install(packageJsonFile)
          const main = packageJson.main || 'index.mjs'
          return await __webpack_require__(17320)(node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(modulePath, ...(main.split('/'))))
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
      // get pathname events (getCanonicalPathnames)
      ...(Object.entries(options).filter(([eventName, listener]) => {
        return typeof listener === 'function' && (
          eventName.startsWith('getPathnames') ||
          eventName.startsWith('getVariables') ||
          eventName.startsWith('getContentAndSources') ||
          eventName.startsWith('getDependencies')
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
    const allFiles = await (0,_utils_getAllCodeFiles_mjs__WEBPACK_IMPORTED_MODULE_4__/* ["default"] */ .Z)(this.cwd)

    // emit preflight event for each file
    const files = []
    for (const filePath of allFiles) {
      const event = {
        filePath,
        relativeFilePath: node_path__WEBPACK_IMPORTED_MODULE_1__.relative(this.cwd, filePath),
        pageBuilder: this,
        isDefaultPrevented: false,
        preventDefault: () => { event.isDefaultPrevented = true }
      }

      await this.emit('preflight', event)

      if (event.isDefaultPrevented) {
        if (this.verbose) console.log('[PageBuilder]', '[preflight]', `File ${event.relativeFilePath} was prevented from being parsed.`)
        continue
      }

      files.push(filePath)
    }

    // create a Page instance for each file
    for (const filePath of files) {
      if (this.pages.find(page => page.id === filePath)) continue
      const page = new _Page_mjs__WEBPACK_IMPORTED_MODULE_6__/* ["default"] */ .Z(filePath, { cwd: this.cwd })
      page.rel = 'canonical'
      await this.emit('page', { page })
      this.pages.push(page)
    }

    // add meta information to each page
    for (const page of this.pages) {
      const event = {
        page,
        pageBuilder: this,
        isDefaultPrevented: false,
        preventDefault: () => { event.isDefaultPrevented = true }
      }
      await this.emit('meta', event)
    }

    // create a clean output directory
    if (node_fs__WEBPACK_IMPORTED_MODULE_2__.existsSync(this.output)) await clean(this.output)
    node_fs__WEBPACK_IMPORTED_MODULE_2__.mkdirSync(this.output, { recursive: true })

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
      event.pathnames = event.pathnames.map(pathname => (0,_utils_getPageInfo_mjs__WEBPACK_IMPORTED_MODULE_5__/* .getFormattedPathname */ ._w)(pathname, { pageBuilder: this, rel: page.rel }))
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

/**
 * Removes all files and directories from the output directory.
 * @param {string} dir - The directory to clean.
 */
async function clean (dir) {
  if (!node_fs__WEBPACK_IMPORTED_MODULE_2__.existsSync(dir)) return

  const promises = []
  for (const dirent of await node_fs__WEBPACK_IMPORTED_MODULE_2__.promises.readdir(dir, { withFileTypes: true })) {
    const direntPath = node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(dir, dirent.name)
    if (dirent.isDirectory()) {
      promises.push(clean(direntPath))
    } else {
      if (node_fs__WEBPACK_IMPORTED_MODULE_2__.existsSync(direntPath)) promises.push(node_fs__WEBPACK_IMPORTED_MODULE_2__.promises.unlink(direntPath))
    }
  }
  await Promise.all(promises)

  if (node_fs__WEBPACK_IMPORTED_MODULE_2__.existsSync(dir)) await node_fs__WEBPACK_IMPORTED_MODULE_2__.promises.rmdir(dir)
}


/***/ }),

/***/ 4988:
/***/ ((__webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(__webpack_module__, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ main)
/* harmony export */ });
/* harmony import */ var node_fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(87561);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(49411);
/* harmony import */ var node_url__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(41041);
/* harmony import */ var _classes_PageBuilder_mjs__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(88368);
/* harmony import */ var _pagesrc_mjs__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(87927);
/* harmony import */ var _utils_getCliArgs_mjs__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(36644);








// Get the absolute path to this file
const __filename = node_url__WEBPACK_IMPORTED_MODULE_2__.fileURLToPath(import.meta.url)
const __dirname = node_path__WEBPACK_IMPORTED_MODULE_1__.dirname(__filename)

// run the main function if this file is executed directly from cmd
if ([__filename, node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(__dirname, '..')].includes(node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(process.argv[1]))) {
  const cwd = (0,_utils_getCliArgs_mjs__WEBPACK_IMPORTED_MODULE_5__/* ["default"] */ .Z)('cwd', 'string', { defaultValue: undefined })
  const output = (0,_utils_getCliArgs_mjs__WEBPACK_IMPORTED_MODULE_5__/* ["default"] */ .Z)('output', 'string', { defaultValue: undefined })
  const port = (0,_utils_getCliArgs_mjs__WEBPACK_IMPORTED_MODULE_5__/* ["default"] */ .Z)('port', 'string', { defaultValue: undefined })
  const watch = (0,_utils_getCliArgs_mjs__WEBPACK_IMPORTED_MODULE_5__/* ["default"] */ .Z)('watch', 'flag', { defaultValue: undefined })
  const verbose = (0,_utils_getCliArgs_mjs__WEBPACK_IMPORTED_MODULE_5__/* ["default"] */ .Z)('verbose', 'flag', { defaultValue: undefined })
  const prefix = (0,_utils_getCliArgs_mjs__WEBPACK_IMPORTED_MODULE_5__/* ["default"] */ .Z)('prefix', 'string', { defaultValue: '' })
  const suffix = (0,_utils_getCliArgs_mjs__WEBPACK_IMPORTED_MODULE_5__/* ["default"] */ .Z)('suffix', 'string', { defaultValue: '' })
  await main({ cwd, output, watch, port, verbose, prefix, suffix })
}

/**
 * @fileoverview This file exports all functionality of the pages module.
 */
async function main (options = {}) {
  options.cwd = options.cwd ? node_path__WEBPACK_IMPORTED_MODULE_1__.isAbsolute(options.cwd) ? options.cwd : node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(process.cwd(), options.cwd) : process.cwd()

  // retrieve the config from pagesrc.mjs
  const pagesRcFiles = [
    node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(options.cwd, 'pagesrc.mjs'),
    node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(options.cwd, '.pagesrc.mjs'),
    node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(options.cwd, 'pagesrc.js'),
    node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(options.cwd, '.pagesrc.js')
  ]
  const pagesrcFile = pagesRcFiles.find(file => node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync(file))
  const pagesrc = {}
  if (pagesrcFile && options.pagesrcFile !== false) Object.assign(pagesrc, await __webpack_require__(66925)(pagesrcFile))

  // parse the config
  const config = Object.assign({ ..._pagesrc_mjs__WEBPACK_IMPORTED_MODULE_4__ }, pagesrc.default || {}, { ...pagesrc, default: undefined })
  for (const [key, value] of Object.entries(config)) if (typeof value === 'undefined') delete config[key]

  // override the config with the options
  config.cwd = options.cwd
  if (options.output) config.output = node_path__WEBPACK_IMPORTED_MODULE_1__.isAbsolute(options.output) ? options.output : node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(process.cwd(), options.output)
  if (options.watch === true || options.watch === false) config.watch = options.watch
  if (options.verbose === true || options.verbose === false) config.verbose = options.verbose
  if (options.port || !config.port) config.port = options.port || 8080
  if (options.prefix) config.prefix = options.prefix
  if (options.suffix) config.suffix = options.suffix

  // create a new PageBuilder instance
  const builder = new _classes_PageBuilder_mjs__WEBPACK_IMPORTED_MODULE_3__/* ["default"] */ .Z(config)

  // build files
  await builder.build()

  // start a webserver and watch for changes if the watch option is set
  if (config.watch) {
    const watch = (await Promise.all(/* import() */[__webpack_require__.e(765), __webpack_require__.e(812)]).then(__webpack_require__.bind(__webpack_require__, 34812))).default
    await watch(builder, config)
  }

  // return the PageBuilder instance
  return builder
}

__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } }, 1);

/***/ }),

/***/ 36644:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Z": () => (/* binding */ getCliArgs)
/* harmony export */ });
/**
 * Retrieve CLI arguments.
 * @param {string} name - The name of the argument.
 * @param {"string"|"list"|"flag"} type - The type of the argument.
 * @param {object} [options={}] - The options.
 * @param {any} [options.defaultValue=undefined] - The default value of the argument. False for flags. Undefined for strings and lists.
 */
function getCliArgs (name, type = 'string', options = {}) {
  const args = process.argv.slice(2)

  // handle flags
  if (type === 'flag') {
    const yes = args.findLastIndex(arg => arg === `--${name}`)
    const no = args.findLastIndex(arg => arg === `--no-${name}`)
    const maybe = args.findLastIndex(arg => arg.startsWith(`--${name}=`))
    if (maybe !== -1 && maybe > yes && maybe > no) {
      const arg = args[maybe]
      const value = arg.split('=').slice(1).join('=').toLowerCase()
      if (['yes', 'true', '1'].includes(value)) return true
      if (['no', 'false', '0'].includes(value)) return false
    }
    if (yes !== -1 && yes > no) return true
    if (no !== -1 && no > yes) return false
    return (options.defaultValue !== false) ? options.defaultValue : false
  }

  // exit early if the argument is not present
  const index = args.findLastIndex(arg => arg === `--${name}` || arg.startsWith(`--${name}=`))
  if (index === -1) return options.defaultValue

  // handle strings
  if (type === 'string') {
    const arg = args[index]
    if (arg.startsWith(`--${name}=`)) return arg.split('=').slice(1).join('=')
    else return args[index + 1]
  }

  // handle lists
  if (type === 'list') {
    const values = args.map((arg, index, args) => {
      if (arg.startsWith(`--${name}=`)) return arg.split('=').slice(1).join('=')
      else if (arg === `--${name}`) return args[index + 1]
      return null
    }).filter(value => value !== null)
    return values
  }

  // throw an error if the type is invalid
  throw new Error(`Invalid type: ${type}`)
}


/***/ })

};
