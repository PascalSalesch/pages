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
 * @param {import('../../src/classes/PageBuilder.mjs').default} event.pageBuilder - The page builder object.
 * @param {string} [event.content=''] - The content of the page.
 * @param {string} [event.url=''] - The url of the page.
 */
export async function transformOfStylesheet (event) {
  const name = path.relative(event.pageBuilder.cwd, event.page.id)
  const content = await getContent(event.content)
  const roots = [event.pageBuilder.cwd, path.dirname(event.page.id)]
  if (event.pageBuilder.verbose) console.log(`[Page] [css-tailwind] [${name}] Starting transformOfStylesheet`)

  const isTailwindResource = content.includes('tailwind') || content.includes('--tw-')
  const twConfig = (isTailwindResource) ? await tailwindConfig(roots) : null
  const plugins = [nested, autoprefixer, (twConfig) ? tailwind(twConfig) : null, cssnano()].filter(Boolean)
  const { css, map } = await postcss(plugins).use(atImport({ plugins })).process(content, { from: event.page.id, map: { annotation: false } })
  const sourcemap = `\n/*# sourceMappingURL=data:application/json;base64,${Buffer.from(map.toString()).toString('base64')} */`

  // add sources to page
  map.toJSON().sources.forEach(source => {
    if (source.trim() === '<no source>') return
    source = resolve(source, [process.cwd(), ...roots])
    if (event.pageBuilder.verbose) console.log(`[Page] [css-tailwind] [${name}] Adding source: ${source}`)
    event.page.addSource(source)
  })

  // If the CSS includes Tailwind classes, add the Tailwind config file to the sources
  if (twConfig) {
    if (typeof twConfig === 'string') {
      if (event.pageBuilder.verbose) console.log(`[Page] [css-tailwind] [${name}] Adding source config: ${twConfig}`)
      event.page.addSource(twConfig)
      const sources = await getSources(twConfig, event)
      for (const source of sources) {
        if (event.pageBuilder.verbose) console.log(`[Page] [css-tailwind] [${name}] Adding source content: ${source}`)
        event.page.addSource(source)
      }
    } else {
      for (const file of (twConfig.content || [])) {
        if (event.pageBuilder.verbose) console.log(`[Page] [css-tailwind] [${name}] Adding source content: ${file}`)
        event.page.addSource(file)
      }
    }
  }

  event.content = css + sourcemap
}

/**
 * Retrieves the sources from the tailwind config.
 * @param {string[]} twConfigContentFiles 
 * @param {boolean} twConfigContentRelative 
 * @param {object} event 
 */
async function getSources (twConfig, event) {
  const twConfigModule = (await import(twConfig))
  const twConfigContent = twConfigModule.content || twConfigModule.default?.content
  const twConfigContentRelative = typeof twConfigContent === 'object' && twConfigContent.relative
  const twConfigContentFiles = (Array.isArray(twConfigContent) ? twConfigContent : (twConfigContent?.files || []))
    .filter(f => typeof f === 'string')

  const twConfigContentFilesFind = twConfigContentFiles.filter(f => !f.startsWith('!'))
  const twConfigContentFilesIgnore = twConfigContentFiles.filter(f => f.startsWith('!')).map(f => f.slice(1))
  if (twConfigContentFilesFind.length === 0) return []

  const twRoot = twConfigContentRelative ? path.dirname(twConfig) : event.pageBuilder.cwd
  const sources = await glob(twConfigContentFilesFind, {
    cwd: twRoot,
    ignore: twConfigContentFilesIgnore
  })
  return sources.map(s => path.resolve(twRoot, s))
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
