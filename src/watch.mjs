import * as http from 'node:http'
import * as https from 'node:https'
import * as path from 'node:path'
import * as fs from 'node:fs'

import handler from 'serve-handler'

/**
 * Starts a webserver and watches for changes.
 * @param {import('./classes/PageBuilder.mjs').default} pageBuilder - The PageBuilder instance.
 * @param {object} config - The config object.
 * @param {Function} after - The userland "after" function.
 */
export default async function watch (pageBuilder, config, after) {
  const protocol = config.cert && config.key ? 'https' : 'http'
  const callback = (...args) => { handler(...args, { public: pageBuilder.output }) }
  const server = protocol === 'http'
    ? http.createServer(callback)
    : https.createServer({ key: fs.readFileSync(config.key), cert: fs.readFileSync(config.cert) }, callback)

  server.listen(config.port, config.host, () => {
    const port = server.address().port
    console.log(`Server running at ${protocol}://${config.host}:${port}`)
  })

  // watch for changes
  const files = pageBuilder.pages.reduce((files, page) => new Set([...files, page.id, ...page.getSubpages(), ...page.getSources()]), [])
  const directories = [...new Set([...files].map(file => path.dirname(file)))]
  const currentlyBuilding = new Set()

  // run page.build on file change
  // run pageBuilder.build on directory change
  const watchers = []
  for (const dir of directories) {
    const watcher = fs.watch(dir, { recursive: false }, async (event, filename) => {
      const file = path.resolve(dir, filename)
      if (event === 'change' && files.has(file)) {
        const pages = pageBuilder.pages.filter(page => page.id === file || page.getSources().includes(file))
        const promises = []
        for (const page of pages) {
          if (currentlyBuilding.has(page)) continue
          currentlyBuilding.add(page)
          promises.push((async () => {
            try {
              await page.build(pageBuilder)
              console.log(`Rebuilt "${path.relative(process.cwd(), page.id)}" from "${path.relative(process.cwd(), file)}" change.`)
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
          console.log(`Rebuilt all pages from "${path.relative(process.cwd(), file)}" change.`)
        } catch (err) {
          console.error(err)
        }
        currentlyBuilding.delete('pageBuilder')
      }
    })
    watchers.push(watcher)
  }

  // stop watching on exit
  process.on('SIGINT', async () => {
    server.closeAllConnections()
    server.close()
    for (const watcher of watchers) watcher.close()
    if (typeof after === 'function') await after()
  })
}
