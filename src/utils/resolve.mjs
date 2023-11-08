import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Resolves a filepath.
 * @param {string} filepath - The filepath to resolve.
 * @param {string[]} [directories=[]] - A list of directories to search for the filepath.
 * @returns {string} The resolved filepath.
 * @throws {Error} If the filepath could not be resolved.
 */
export default function resolve (filepath, directories = []) {
  if (path.isAbsolute(filepath) && fs.existsSync(filepath)) {
    if (!(fs.lstatSync(filepath).isFile())) throw new Error(`The filepath ${filepath} is not a file.`)
    return filepath
  }
  for (const directory of directories) {
    if (!directory) continue
    const resolved = path.resolve(directory, ...filepath.split('/'))
    if (fs.existsSync(resolved)) return resolved
  }
  throw new Error(`Could not resolve filepath: ${filepath}`)
}
