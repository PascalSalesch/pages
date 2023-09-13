import * as crypto from 'node:crypto'

import getContent from '../../src/utils/getContent.mjs'

import render from './render.mjs'
import minify from './minify.mjs'

import { JSDOM } from 'jsdom'

/**
 * Retrieves the evaluated content and sources of a page.
 * @param {object} event - The event.
 * @param {Page} event.page - The page.
 * @param {object} event.variables - All static and dynamic path part values.
 * @param {object} [event.replace={}] - The values to replace in the content.
 */
export async function getContentAndSourcesOfCanonical (event) {
  const renderInput = { filePath: event.page.id }
  const { content, sources } = await render(renderInput, {
    outputType: 'json',
    variables: event.variables,
    replace: event.replace,
    page: event.page,
    pageBuilder: event.pageBuilder
  })

  if (content) {
    event.content = content
    event.sources = sources
  }
}

/**
 * Minifies HTML.
 * @param {object} event - The event object.
 * @param {import('../../src/classes/Page.mjs').default} event.page - The page object.
 * @param {string} [event.content=''] - The content of the page.
 * @param {string} [event.url=''] - The url of the page.
 */
export async function transformOfCanonical (event) {
  event.content = `<!doctype html>${await minify(await getContent(event.content))}`

  // find script and style tags and add the integrity attribute
  const document = (new JSDOM(event.content)).window.document
  const tags = [
    ...document.querySelectorAll('script:not(:empty)'),
    ...document.querySelectorAll('style:not(:empty)')
  ]
  for (const tag of tags) {
    const outerHTML = tag.outerHTML
    const content = tag.innerHTML
    const algorithm = tag.getAttribute('integrity')
    if (!algorithm || algorithm.includes('-')) continue
    const hash = crypto.createHash(algorithm)
    const integrity = (hash.update(content) && hash).digest('base64')
    tag.setAttribute('integrity', `${algorithm}-${integrity}`)
    event.content = event.content.replace(outerHTML, tag.outerHTML)

    // update the content-security-policy
    const meta = event.content.match(/<meta[^<]*?Content-Security-Policy.*?>/i)?.[0]
    if (meta) {
      const policy = `'${algorithm}-${integrity}'`
      const directive = tag.tagName.toUpperCase() === 'SCRIPT' ? 'script-src' : 'style-src'
      const csp = meta.match(/content="([^"]*)"/i)[1]
      const updatedCSP = csp.includes(directive)
        ? csp.split(';').map(part => {
          if (!(part.trim().startsWith(directive))) return part
          if (part.includes(policy)) return part
          return `${part} ${policy}`
        }).join(';')
        : `${csp.endsWith(';') ? csp : `${csp};`} ${directive} ${policy};`
      const updatedMeta = meta.replace(csp, updatedCSP)
      event.content = event.content.replace(meta, updatedMeta)
    }
  }
}
