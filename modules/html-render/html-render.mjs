import getContent from '../../src/utils/getContent.mjs'

import render from './render.mjs'
import minify from './minify.mjs'

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
}
