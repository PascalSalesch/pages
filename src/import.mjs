import * as url from 'node:url'
import * as path from 'node:path'

import _resolve from './utils/resolve.mjs'

const dataRaw = (import.meta.url).slice('file://'.length + url.fileURLToPath(import.meta.url).length + '?'.length)
const data = JSON.parse(atob(dataRaw))

/**
 * The absolute path to the current module.
 * @type {string|null}
 */
export const __filename = data.fileref || null

/**
 * The absolute path to the directory of the current module.
 * @type {string|null}
 */
export const __dirname = data.fileref ? path.dirname(data.fileref) : null

/**
 * All variables that are available in the current module.
 * @type {object}
 */
export const variables = data.variables || {}

/**
 * A list of current values that have been used to replace the template literals in the dynamic canonical url.
 * @type {string[]}
 */
export const urlParts = data.variables?.urlParts || []

/**
 * Resolves a file path to an absolute path.
 * @param {string} file - The file path to resolve.
 * @returns {string} The absolute path.
 * @throws {Error} If the filepath could not be resolved.
 */
export function resolve (file) {
  return _resolve(file, [__dirname, data.dir, data.cwd])
}

/**
 * Retrieves the value of a dynamic url parameter.
 * @param {string|number} id - The id of the url parameter.
 * @returns {string}
 */
export function getUrlParameters (id) {
  return urlParts[Number(id) - 1]
}
