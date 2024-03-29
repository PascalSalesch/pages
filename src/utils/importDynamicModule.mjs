import * as path from 'node:path'
import * as url from 'node:url'

import resolve from './resolve.mjs'

global.contexts = global.contexts || {}

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

  const importModuleFile = url.pathToFileURL(path.resolve(__dirname, '..', 'import.mjs')).href
  const contextId = options.contextId || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const paramsId = options.params ? JSON.stringify(options.params) : ''
  const globalContextId = `${path.relative(process.cwd(), options.fileref) + contextId + paramsId}`.replace(/[^a-zA-Z0-9]/g, '-')
  global.contexts[globalContextId] = {
    cwd: options.cwd,
    dir: options.dir,
    fileref: options.fileref,
    variables: { ...options.variables },
    params: options.params
  }

  const content = `// Context : ${contextId}\n` + js.replace(/[eimx]{2}port[^\n]+from[^'"]*["'](\.[^'"]+)["']/g, (match, filepath) => {
    const file = resolve(filepath, [options.dir, options.cwd])
    const importUrl = `${url.pathToFileURL(file).href}?id=${contextId}`
    return match.replace(filepath, importUrl)
  }).replace(/[eimx]{2}port[^\n]+from[^'"]*["'](@pascalsalesch\/pages)["']/g, (match, filepath) => {
    return match.replace(filepath, `${importModuleFile}?id=${globalContextId}`)
  })

  const importableContent = `data:text/javascript;base64,${btoa(content)}`

  try {
    const module = await import(importableContent)
    return { ...module }
  } catch (err) {
    if (err.stack && err.stack.includes('data:text/javascript')) {
      const msg = err.message.replace(new RegExp(`${importModuleFile}[^'"]*`, 'g'), '@pascalsalesch/pages')
      const error = msg + err.stack.split('\n').slice(0, 2).join('\n')
        .replace(importableContent, `\n${js.split('\n').map((line, i) => `${i + 2}: ${line}`).join('\n')}\n    at ${options.fileref}`)
      throw new Error(error)
    } else {
      throw err
    }
  } finally {
    delete global.contexts[contextId]
  }
}
