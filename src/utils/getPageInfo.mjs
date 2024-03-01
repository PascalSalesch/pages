import * as fs from 'node:fs'
import * as path from 'node:path'

import Page from '../classes/Page.mjs'

import importDynamicModule from './importDynamicModule.mjs'

/**
 * Retrieves the content and sources of a page.
 * @param {Page} page - The page.
 * @returns {{content:fs.ReadStream,sources:string[]}} - The content and sources of the page.
 */
export function getContentAndSources (page) {
  return {
    content: fs.createReadStream(page.id, { encoding: undefined }),
    sources: []
  }
}

/**
 * Retrieves the pathname of a page from a list of paths. The pathname is the part of the path that is different from all other paths.
 * @param {string} path - The path to the page.
 * @param {string[]} paths - A list of paths to pages.
 * @param {object} [options={}] - Options for the function.
 * @param {string} [options.rel] - The rel of the page.
 * @param {import('./PageBuilder.mjs').default} [options.pageBuilder] - The PageBuilder instance.
 * @returns {string} - The pathname of the page.
 */
export function getPathname (filePath, paths, options = {}) {
  const firstDifferencePosition = paths.reduce((firstDifferencePosition, cur) => {
    const curDifferencePosition = cur.split('').findIndex((char, index) => char !== filePath[index])
    if (curDifferencePosition === -1) return firstDifferencePosition
    return Math.min(firstDifferencePosition, curDifferencePosition)
  }, Infinity)

  // find the first slash before the first difference
  let pathname = filePath.slice(0, firstDifferencePosition).lastIndexOf('/') === -1
    ? filePath.slice(firstDifferencePosition)
    : filePath.slice(filePath.slice(0, firstDifferencePosition).lastIndexOf('/') + 1)

  if (pathname === '') pathname = path.basename(filePath)

  return getFormattedPathname(pathname, options)
}

/**
 * Formats the pathname of a page.
 * @param {string} pathname - The path to the page.
 * @param {object} [options={}] - Options for the function.
 * @param {string} [options.rel] - The rel of the page.
 * @param {import('./PageBuilder.mjs').default} [options.pageBuilder] - The PageBuilder instance.
 * @returns {string} - The pathname of the page.
 */
export function getFormattedPathname (pathname, options = {}) {
  const isDynamic = pathname.includes('${') && pathname.includes('}')

  // remove multiple beginning slashes
  while (pathname.startsWith('/')) pathname = pathname.slice(1)

  // begin with a single slash
  pathname = `/${pathname}`

  // remove multiple ending slashes
  const endsWithSlash = pathname.endsWith('/')
  while (pathname.endsWith('/')) pathname = pathname.slice(0, -1)

  // add index.html to canonical pages
  if (endsWithSlash) {
    if (options?.rel === 'canonical') pathname = pathname + '/index.html'
    else throw new Error(`The page with pathname ${pathname} has a trailing slash, but its rel is not canonical.`)
  }

  // add prefix
  const addPrefix = !(isDynamic && pathname.startsWith('/${'))
  if (addPrefix) {
    const prefix = options.pageBuilder?.prefix || ''
    if (prefix && !(pathname.startsWith(prefix))) pathname = prefix + pathname
  }

  // add suffix
  const addSuffix = !(isDynamic && pathname.endsWith('}'))
  if (addSuffix) {
    // add .html to canonical pages
    if (options?.rel === 'canonical') {
      if (!pathname.endsWith('.html')) pathname = pathname + '.html'
    }

    const suffix = options.pageBuilder?.suffix || ''
    if (suffix) {
      const ext = path.extname(pathname)
      if (!ext) {
        if (!(pathname.endsWith(suffix))) pathname = pathname + suffix
      } else {
        if (!(pathname.endsWith(suffix + ext))) {
          pathname = pathname.slice(0, -ext.length) + suffix + ext
        }
      }
    }
  }

  return pathname
}

/**
 * Get all <script target="url"></script> tags from the page.
 * @param {string} file - The absolute path to the page.
 * @param {import('./PageBuilder.mjs').default} pageBuilder - The PageBuilder instance.
 * @returns {object} - The values of the <script target="url"></script> tags.
 */
export async function getUrlValues (file, pageBuilder) {
  const content = await fs.promises.readFile(file, { encoding: 'utf-8' })
  const regex = /<script([^>]*)>((?:(?!<\/script>)[\s\S])*?)<\/script>/gi
  const scripts = []
  for (const match of content.matchAll(regex)) {
    const attributes = match[1]
    const targetUrlMatch = attributes.match(/target=["']url["']/i)
    if (targetUrlMatch) scripts.push(match[2])
  }

  const allValues = {}
  for (const script of scripts) {
    const values = await importDynamicModule(script, {
      cwd: pageBuilder.cwd,
      dir: path.dirname(file),
      fileref: file
    })
    Object.assign(allValues, values)
  }

  return allValues
}

/**
 * Retrieves the absolute path to the page from a reference.
 * @param {reference} ref
 * @param {object} [options={}] - Options for the function.
 * @param {import('../classes/PageBuilder.mjs').default} [options.pageBuilder] - The PageBuilder instance.
 * @param {object} [options.urlPaths={}] - Maps url paths to page ids.
 */
export function getId (ref, options = {}) {
  // check if the ref is already known
  if (Page.pages[ref]) return Page.pages[ref].id

  // check if the ref is an outerHTML
  if (ref.startsWith('<')) {
    const attributes = ['src', 'srcset', 'href', 'action', 'data-src']
    for (const attribute of attributes) {
      const regex = new RegExp(`${attribute}=["']([^"']*)["']`, 'i')
      const match = ref.match(regex)
      if (match) {
        const url = match[1]
        const id = getId(url, { options, throwError: false })
        if (id) return id
      }
    }
  }

  // check if the ref is a known path
  if (options.urlPaths) {
    if (options.urlPaths[ref]) return options.urlPaths[ref]
    if (ref.endsWith('/')) {
      if (options.urlPaths[ref + 'index.html']) return options.urlPaths[ref + 'index.html']
      if (options.urlPaths[ref.slice(0, -1) + '.html']) return options.urlPaths[ref.slice(0, -1) + '.html']
    } else {
      if (options.urlPaths[ref + '.html']) return options.urlPaths[ref + '.html']
      if (options.urlPaths[ref + '/index.html']) return options.urlPaths[ref + '/index.html']
    }
  }

  // check if the ref is an absolute path
  if (fs.existsSync(path.resolve(ref)) && fs.statSync(path.resolve(ref)).isFile()) {
    return path.resolve(ref)
  }

  // check if the ref is a relative path
  if (options.cwd) {
    const cwd = options.cwd
    const relativePath = path.resolve(cwd, ...ref.split('/'))
    if (fs.existsSync(relativePath) && fs.statSync(relativePath).isFile()) return relativePath
  }

  // check if the ref contains a prefix or suffix
  if (options.pageBuilder) {
    const cwd = options.pageBuilder.cwd
    const relativePath = path.resolve(cwd, ...ref.split('/'))
    if (fs.existsSync(relativePath) && fs.statSync(relativePath).isFile()) return relativePath

    const prefix = options.pageBuilder.prefix
    const suffix = options.pageBuilder.suffix
    if (prefix) {
      if (!(ref.startsWith(prefix))) {
        const id = getId(prefix + ref, { ...options, throwError: false })
        if (id) return id
      }
    }
    if (suffix) {
      const ext = path.extname(ref)
      if (!(ref.endsWith(suffix + ext))) {
        const newRef = ref.slice(0, -ext.length) + suffix + ext
        const id = getId(newRef, { ...options, throwError: false })
        if (id) return id
      }
    }
  }

  if (ref.includes('#')) return getId(ref.split('#')[0], options)
  if (ref.includes('?')) return getId(ref.split('?')[0], options)

  // if the ref is not an absolute path, a relative path or a reference, throw an error
  if (options.throwError === false) return null
  throw new Error(`Could not find page with reference "${ref}"${options.outerHTML ? ` in ${options.outerHTML}` : ''}`)
}
