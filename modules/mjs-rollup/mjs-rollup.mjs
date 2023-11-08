import * as fs from 'node:fs'
import * as path from 'node:path'

import { rollup } from 'rollup'
import json from '@rollup/plugin-json'
import terser from '@rollup/plugin-terser'
import { nodeResolve } from '@rollup/plugin-node-resolve'

import resolve from '../../src/utils/resolve.mjs'
import getContent from '../../src/utils/getContent.mjs'

import rollupInlinePlugin from './rollupInlinePlugin.mjs'

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
