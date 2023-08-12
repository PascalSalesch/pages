import * as fs from 'node:fs'
import * as readline from 'node:readline'
import * as os from 'node:os'
import * as path from 'node:path'

import { JSDOM } from 'jsdom'

import { getId } from './src/utils/getPageInfo.mjs'

/**
 * @fileoverview This file exports all overwritable functionality of the pages module.
 */

/**
 * @type {string} - Where to output the pages.
 */
export const output = path.resolve(os.tmpdir(), `pages-${(new Date()).toISOString().substring(0, 10).replaceAll('-', '')}`)

/**
 * @type {number} - The port to use for the dev server.
 */
export const port = 8080

/**
 * @type {string} - The prefix to use for all paths. The prefix affects the build location and the HTML of the pages.
 */
export const prefix = '/'

/**
 * @type {string} - The suffix (before extensions) to use for all paths. The suffix affects the build location and the HTML of the pages.
 */
export const suffix = ''

/**
 * @type {boolean} - Whether or not to print verbose output.
 */
export const verbose = false

/**
 * @type {string[]} - The modules to use.
 */
export const modules = [
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
 * @param {function} event.setOuterHTML - A function that sets the outerHTML for the meta call.
 */
export async function preflight ({ filePath, relativeFilePath, preventDefault, setOuterHTML, isDefaultPrevented }) {
  if (isDefaultPrevented) return
  if (!(filePath.endsWith('.html'))) return preventDefault()

  let lineNumber = 0
  const stream = fs.createReadStream(filePath)
  const rl = readline.createInterface({ input: stream })
  for await (const line of rl) {
    lineNumber++

    // make sure the file starts with <html
    if (lineNumber === 1 && !line.startsWith('<html')) {
      stream.close()
      return preventDefault()
    }

    // make sure the file contains a canonical link
    if (line.match(/<link[^>]+rel=['"]canonical['"]/i) && line.match(/<link[^>]+href=['"]/i)) {
      // get the link tag of the line
      const linkTag = line.match(/<link[^>]+>/i)[0]
      setOuterHTML(linkTag)

      stream.close()
      return
    }
  }
  stream.close()

  // empty files should not be parsed
  if (lineNumber === 0) return preventDefault()

  // warn about missing canonical link
  console.warn(`[PageBuilder] [preflight] File ${relativeFilePath} does not contain a canonical link.`)
  setOuterHTML(`<link rel="canonical" href="${relativeFilePath}" />`)
}

/**
 * Sets the rel (how to parse the file) of the page. From the outerHTML of the including tag.
 * @param {object} event - The event object.
 * @param {import('./src/classes/Page.mjs').default} event.page - The page object.
 * @param {string} [event.outerHTML=''] - The outerHTML of the page.
 */
export async function meta ({ page, outerHTML = '', isDefaultPrevented }) {
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
export async function getPathnamesOfCanonical (event) {
  const stream = fs.createReadStream(event.page.id)
  const rl = readline.createInterface({ input: stream })
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
export async function getDependenciesOfCanonical (event) {
  // create a dom from the content
  const document = (new JSDOM(event.content)).window.document
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

      const id = getId(src, { cwd: event.cwd || path.dirname(event.page.id), urlPaths: event.urlPaths, pageBuilder: event.pageBuilder })
      const page = {}
      await meta({ page, outerHTML })
      if (page.rel) event.dependencies.push({ id, rel: page.rel, outerHTML, src })
    }
  }
}
