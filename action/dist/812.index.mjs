export const id = 812;
export const ids = [812];
export const modules = {

/***/ 34812:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ watch)
/* harmony export */ });
/* harmony import */ var node_http__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(88849);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(49411);
/* harmony import */ var node_fs__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(87561);
/* harmony import */ var serve_handler__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(58765);






/**
 * Starts a webserver and watches for changes.
 * @param {import('./classes/PageBuilder.mjs').default} pageBuilder - The PageBuilder instance.
 * @param {object} config - The config object.
 */
async function watch (pageBuilder, config) {
  const server = node_http__WEBPACK_IMPORTED_MODULE_0__.createServer((...args) => { serve_handler__WEBPACK_IMPORTED_MODULE_3__(...args, { public: pageBuilder.output }) })
  server.listen(config.port, () => {
    const port = server.address().port
    console.log(`Server running at http://localhost:${port}`)
  })

  // watch for changes
  const files = pageBuilder.pages.reduce((files, page) => new Set([...files, page.id, ...page.getSubpages(), ...page.getSources()]), [])
  const directories = [...new Set([...files].map(file => node_path__WEBPACK_IMPORTED_MODULE_1__.dirname(file)))]
  const currentlyBuilding = new Set()

  // run page.build on file change
  // run pageBuilder.build on directory change
  const watchers = []
  for (const dir of directories) {
    const watcher = node_fs__WEBPACK_IMPORTED_MODULE_2__.watch(dir, { recursive: false }, async (event, filename) => {
      const file = node_path__WEBPACK_IMPORTED_MODULE_1__.resolve(dir, filename)
      if (event === 'change' && files.has(file)) {
        const pages = pageBuilder.pages.filter(page => page.id === file || page.getSources().includes(file))
        const promises = []
        for (const page of pages) {
          if (currentlyBuilding.has(page)) continue
          currentlyBuilding.add(page)
          promises.push((async () => {
            try {
              await page.build(pageBuilder)
              console.log(`Rebuilt "${node_path__WEBPACK_IMPORTED_MODULE_1__.relative(process.cwd(), page.id)}" from "${node_path__WEBPACK_IMPORTED_MODULE_1__.relative(process.cwd(), file)}" change.`)
            } catch (err) {
              console.error(err)
            }
            currentlyBuilding.delete(page)
          })())
        }
        await Promise.all(promises)
      } else {
        if (currentlyBuilding.has('pageBuilder')) return
        currentlyBuilding.add('pageBuilder')
        try {
          await pageBuilder.build()
          console.log(`Rebuilt all pages from "${node_path__WEBPACK_IMPORTED_MODULE_1__.relative(process.cwd(), file)}" change.`)
        } catch (err) {
          console.error(err)
        }
        currentlyBuilding.delete('pageBuilder')
      }
    })
    watchers.push(watcher)
  }

  // stop watching on exit
  process.on('SIGINT', () => {
    server.close()
    for (const watcher of watchers) watcher.close()
  })
}


/***/ })

};
