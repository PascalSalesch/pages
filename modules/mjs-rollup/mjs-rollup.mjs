import * as fs from 'node:fs'
import * as path from 'node:path'

import { rollup } from 'rollup'
import json from '@rollup/plugin-json'
import terser from '@rollup/plugin-terser'
import { nodeResolve } from '@rollup/plugin-node-resolve'

import resolve from '../../src/utils/resolve.mjs'
import getContent from '../../src/utils/getContent.mjs'

/**
 * Minifies HTML.
 * @param {object} event - The event object.
 * @param {import('../../src/classes/Page.mjs').default} event.page - The page object.
 * @param {string} [event.content=''] - The content of the page.
 * @param {string} [event.url=''] - The url of the page.
 */
export async function transformOfScript (event) {
  const roots = [event.pageBuilder.cwd, path.dirname(event.page.id)]

  event.content = await getContent(event.content)
  const bundle = await rollup({
    input: event.page.id,
    plugins: [
      rollupInlinePlugin(event.content, event.page.id),
      json(),
      nodeResolve(),
      terser()
    ]
  })

  const { code, map } = (await bundle.generate({ format: 'iife', sourcemap: 'inline' })).output[0]
  map.sources.forEach(source => {
    source = resolve(source, [process.cwd(), ...roots])
    event.page.addSource(source)
  })

  await bundle.close()
  event.content = code
}

/**
 * Entry chunk for rollup. This allows dynamic content to be bundled.
 * @param {string} content - The content to inline.
 * @param {string} filename - The pathname of the file.
 * @returns {import('rollup').Plugin}
 */
function rollupInlinePlugin (content, filename) {
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
