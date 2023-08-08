import * as path from 'node:path'

import getContent from '../../src/utils/getContent.mjs'
import { getId, getContentAndSources } from '../../src/utils/getPageInfo.mjs'

/**
 * Adds the Dependencies of the page.
 * @param {object} event - The event object.
 * @param {Array<{id:string,rel:string}>} event.dependencies - The Dependencies of the page.
 * @param {import('./src/classes/Page.mjs').default} event.page - The page object.
 * @param {string} event.content - The content of the page.
 * @param {object} event.variables - All the variables.
 * @param {object} event.urlPaths - Maps url paths to page ids.
 */
export async function getContentAndSourcesOfManifest (event) {
  const content = await getContent(getContentAndSources(event.page).content)
  event.content = JSON.parse(content)
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
export async function getDependenciesOfManifest (event) {
  const content = await getContent(event.content)
  const manifest = JSON.parse(content)
  const icons = [...manifest.icons, manifest.icon, manifest.appleTouchIcon].filter(v => v).map(v => v.src)
  for (const icon of icons) {
    const id = getId(icon, { cwd: event.cwd || path.dirname(event.page.id), urlPaths: event.urlPaths, pageBuilder: event.pageBuilder })
    event.dependencies.push({ id, rel: 'icon', outerHTML: icon, src: icon })
  }
}
