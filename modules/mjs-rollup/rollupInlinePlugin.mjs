import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Entry chunk for rollup. This allows dynamic content to be bundled.
 * @param {string} content - The content to inline.
 * @param {string} filename - The pathname of the file.
 * @returns {import('rollup').Plugin}
 */
export default function rollupInlinePlugin (content, filename) {
  const name = filename
  return {
    name: 'inline',
    resolveId (source, importer) {
      if (source === filename) return name
      if (importer === name) {
        if (filename && source.startsWith('.')) {
          const resolved = path.resolve(path.dirname(filename), source)
          if (resolved === filename) return name
          if (fs.existsSync(resolved)) return resolved
        }
      }
      return null
    },
    load (id) {
      if (id === name) return content
      return null
    }
  }
}
