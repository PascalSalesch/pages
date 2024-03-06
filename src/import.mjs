import * as path from 'node:path'

import _resolve from './utils/resolve.mjs'

const searchParams = new URL(import.meta.url).searchParams

/**
 * The parsed raw data.
 * @type {object}
 */
export const data = global.contexts[searchParams.get('id')]

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
 * Includes an HTML file.
 * @type {function}
 * @param {string} file - The file to include.
 * @returns {Promise<string>} The included file.
 */
export const include = data.include

/**
 * All variables that are available in the current module.
 * @type {string}
 */
export const href = Array.isArray(variables.allUrlParts) ? variables.allUrlParts.join('') : (variables.allUrlParts || '')

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
export function getUrlParameter (id) {
  return Object.values(urlParts)[Number(id) - 1]
}

/**
 * Retrieves the value of a dynamic url parameter.
 * @param {string} id - The id of the url parameter.
 * @returns {string}
 */
export function getUrlParameterByName (name) {
  return urlParts[name]
}
