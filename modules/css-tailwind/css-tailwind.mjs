import * as fs from 'node:fs'
import * as path from 'node:path'

import { glob } from 'glob'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import nested from 'postcss-nested'
import atImport from 'postcss-import'
import cssnano from 'cssnano'

import getAllCodeFiles from '../../src/utils/getAllCodeFiles.mjs'
import getContent from '../../src/utils/getContent.mjs'
import resolve from '../../src/utils/resolve.mjs'

/**
 * Resolves tailwindcss classes.
 * @param {object} event - The event object.
 * @param {import('../../src/classes/Page.mjs').default} event.page - The page object.
 * @param {string} [event.content=''] - The content of the page.
 * @param {string} [event.url=''] - The url of the page.
 */
export async function transformOfStylesheet (event) {
  const content = await getContent(event.content)
  const roots = [event.pageBuilder.cwd, path.dirname(event.page.id)]

  const isTailwindResource = content.includes('tailwind') || content.includes('--tw-')
  const twConfig = (isTailwindResource) ? await tailwindConfig(roots) : null
  const plugins = [nested, autoprefixer, (twConfig) ? tailwind(twConfig) : null, cssnano()].filter(Boolean)
  const { css, map } = await postcss(plugins).use(atImport({ plugins })).process(content, { from: event.page.id, map: { annotation: false } })
  const sourcemap = `\n/*# sourceMappingURL=data:application/json;base64,${Buffer.from(map.toString()).toString('base64')} */`

  // add sources to page
  map.toJSON().sources.forEach(source => {
    if (source.trim() === '<no source>') return
    source = resolve(source, [process.cwd(), ...roots])
    event.page.addSource(source)
  })

  // If the CSS includes Tailwind classes, add the Tailwind config file to the sources
  if (twConfig) {
    if (typeof twConfig === 'string') {
      event.page.addSource(twConfig)
      const twConfigModule = (await import(twConfig))
      const twConfigContent = twConfigModule.content || twConfigModule.default?.content
      const sources = (twConfigContent && (await glob(twConfigContent, { cwd: event.pageBuilder.cwd }))) || []
      for (const source of sources) event.page.addSource(source)
    } else {
      for (const file of (twConfig.content || [])) {
        event.page.addSource(file)
      }
    }
  }

  event.content = css + sourcemap
}

/**
 * Tailwind config.
 * @returns {Promise<import('tailwindcss/tailwind-config').TailwindConfig>}
 */
async function tailwindConfig (roots) {
  const twConfigs = ['tailwind.config.mjs', 'tailwind.config.js', 'tailwind.config.cjs']

  for (const cwd of roots) {
    for (const config of twConfigs) {
      const twConfig = path.resolve(cwd, config)
      if (fs.existsSync(twConfig)) return twConfig
    }
  }

  // If no config file is found, use a default config
  const content = (await getAllCodeFiles(roots[0])).filter(f => f.endsWith('.css') || f.endsWith('.html') || f.endsWith('.js') || f.endsWith('.mjs'))
  const config = {
    content,
    theme: {
      extend: {
      }
    },
    plugins: []
  }

  return config
}
