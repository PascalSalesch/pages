import * as path from 'node:path'
import * as url from 'node:url'

import resolve from './resolve.mjs'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

/**
 * Evaluates the content of a JavaScript string as if it were a module.
 * @param {string} js - The JavaScript string to evaluate.
 * @param {object} options - Options for the function.
 * @param {string} [options.cwd=process.cwd()] - The current working directory.
 * @param {string} [options.dir=options.cwd] - The directory of the JavaScript string.
 * @param {string} [options.fileref=options.dir] - The file reference of the JavaScript string.
 * @param {object} [options.variables={}] - The variables to pass to the import.
 * @param {"html"|"json"} [options.outputType='html'] - The type of output to render.
 * @returns {Promise<object>} - The evaluated module.
 */
export default async function importDynamicModule (js, options = {}) {
  options.cwd = options.cwd || process.cwd()
  options.dir = options.dir || options.cwd
  options.fileref = options.fileref || options.dir

  const importModuleFile = path.resolve(__dirname, '..', 'import.mjs')
  const content = `// Cachebuster : ${Date.now()}\n` + js.replace(/[eimx]{2}port[^\n]+from[^'"]*["'](\.[^'"]+)["']/g, (match, filepath) => {
    const file = resolve(filepath, [options.dir, options.cwd])
    return match.replace(filepath, `file://${file}?cachebuster=${Date.now()}`)
  }).replace(/[eimx]{2}port[^\n]+from[^'"]*["'](@pascalsalesch\/pages)["']/g, (match, filepath) => {
    return match.replace(filepath, `file://${importModuleFile}?${btoa(JSON.stringify({
      cachebuster: Date.now(),
      cwd: options.cwd,
      dir: options.dir,
      fileref: options.fileref,
      variables: { ...options.variables, include: undefined }
    }))}`)
  })

  const importableContent = `data:text/javascript;charset=utf-8,${encodeURIComponent(content)}`

  try {
    const module = await import(importableContent)
    return { ...module }
  } catch (err) {
    if (err.stack && err.stack.includes('data:text/javascript')) {
      const msg = err.message.replace(new RegExp(`file://${importModuleFile}[^'"]*`, 'g'), '@pascalsalesch/pages')
      const error = msg + err.stack.split('\n').slice(0, 2).join('\n')
        .replace(importableContent, `\n${js.split('\n').map((line, i) => `${i + 2}: ${line}`).join('\n')}\n    at ${options.fileref}`)
      throw new Error(error)
    } else {
      throw err
    }
  }
}
