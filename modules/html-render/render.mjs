import * as fs from 'node:fs'
import * as path from 'node:path'

import resolve from '../../src/utils/resolve.mjs'
import importDynamicModule from '../../src/utils/importDynamicModule.mjs'
import splitByTemplateLiterals from '../../src/utils/splitByTemplateLiterals.mjs'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

/**
 * @typedef {object} renderInput - The context of an include. Either content or filePath must be provided.
 * @property {string} [renderInput.content] - The content of the page.
 * @property {string} [renderInput.filePath] - The absolute path to the page.
 * @property {string} [renderInput.cwd] - The current working directory.
 * @property {string} [renderInput.dir] - The directory of the page.
 */

/**
 * @typedef {object} includeContext - The context of an include.
 * @property {string} includeContext.main - The absolute path to the page.
 * @property {string} includeContext.dir - The directory of the page.
 * @property {string} includeContext.cwd - The current working directory.
 * @property {string} includeContext.outputType - The type of output to render.
 * @property {string[]} includeContext.sources - The sources of the page.
 * @property {object} includeContext.variables - The variables to use for rendering.
 * @property {string} includeContext.fileref - The absolute path to the file.
 */

/**
 * Renders a page.
 * @param {renderInput} renderInput - The context of an include.
 * @param {object} [options={}] - Options for the function.
 * @param {"html"|"json"} [options.outputType='html'] - The type of output to render.
 * @param {object} [options.variables={}] - The variables to use for rendering.
 * @param {object} [options.replace={}] - The values to replace in the content.
 */
export default async function render (renderInput, options = {}) {
  const includeContext = typeof renderInput === 'object'
    ? {
        main: renderInput.filePath,
        dir: renderInput.dir || path.dirname(renderInput.filePath),
        cwd: renderInput.cwd || options.pageBuilder.cwd
      }
    : {
        main: renderInput,
        dir: path.dirname(renderInput),
        cwd: options.pageBuilder.cwd
      }

  includeContext.outputType = options.outputType || 'html'
  includeContext.sources = []
  includeContext.variables = options.variables || {}
  includeContext.replace = options.replace || {}
  includeContext.fileref = includeContext.main
  includeContext.pageBuilder = options.pageBuilder
  includeContext.page = options.page

  // start parsing
  const content = await include.call(includeContext, includeContext.main)

  // return the result
  if (options.outputType === 'json') {
    return {
      content,
      sources: includeContext.sources.filter((source, index, sources) => sources.indexOf(source) === index)
    }
  }
  return content
}

/**
 * Includes a file.
 * @this {includeContext} - The context of an include.
 * @param {string} fileref - The absolute path to the file.
 * @returns {string} - The content of the file.
 */
async function include (fileref) {
  fileref = resolve(fileref, [this.dir, this.cwd])
  this.sources.push(fileref)
  const fileContent = await fs.promises.readFile(fileref, { encoding: 'utf-8' })
  const ctx = { ...this, fileref, dir: path.dirname(fileref) }

  // prepare the content for rendering
  const contentBeforeRender = fileContent
    // replace the url parts in the head
    .replace(/<head[^>]*>(?:(?!<\/head>)[\s\S])*?<\/head>/gi, (match) => {
      for (const [key, value] of Object.entries(ctx.replace)) {
        match = match.replaceAll(key, value)
      }
      return match
    })

  // info: variables are passed on to the import.mjs as a JSON string
  // The data constant contains variables that should not be passed on but should be available during the rendering.
  const { content, variables } = await getRenderData(contentBeforeRender, ctx)
  const data = {
    include: include.bind(ctx),
    __filename: fileref,
    __dirname: path.dirname(fileref)
  }

  // render the content
  try {
    const renderFunction = new AsyncFunction(...Object.keys(data), Object.keys(variables), `return \`${content}\``)
    let renderedContent = (await renderFunction(...Object.values(data), ...Object.values(variables)))

    const { dependencies } = await ctx.pageBuilder.getDependencies(ctx.page, {
      content: renderedContent,
      urlPath: ctx.variables.url,
      variables: ctx.variables,
      cwd: data.__dirname
    })

    // get unique outerHTMLs
    const uniqueOuterHTML = dependencies.map(dependency => dependency.outerHTML).filter((v, i, a) => a.indexOf(v) === i)
    for (const outerHTML of uniqueOuterHTML) {
      let newOuterHTML = outerHTML
      const container = dependencies.filter(dependency => dependency.outerHTML === outerHTML)

      // replace identifiable url parts with their corresponding file id, to resolve relative paths
      // if there are multiple known urls then don't replace the html and instead let `page.buildPath` pick the right path based on the outerHTML
      for (const { src, id } of container) {
        const urlPaths = Object.values(ctx.pageBuilder.urlPaths).filter((file) => file === id)
        if (urlPaths.length === 0 || urlPaths.length === 1) newOuterHTML = newOuterHTML.replaceAll(src, id)
      }

      renderedContent = renderedContent.replaceAll(outerHTML, newOuterHTML)
    }

    return renderedContent
  } catch (err) {
    err.message = err.message + '\n    at ' + fileref
    throw err
  }
}

/**
 * Removes the <script target="body"></script> tags from the page and returns their values.
 * Removes the <script target="head"></script> tags without evaluating them.
 * @param {string} content - The content of the page.
 * @returns {Promise<{content:string,variables:object}>} - The content of the page and the values of the <script target="body"></script> tags.
 */
async function getRenderData (content, ctx) {
  const regex = /<script([^>]*)>((?:(?!<\/script>)[\s\S])*?)<\/script>/g
  const scripts = []

  content = content.replace(regex, (match, attributes, value) => {
    const typeMatch = attributes.match(/type=["']module["']/)
    const targetHeadMatch = attributes.match(/target=["']head["']/)
    const targetBodyMatch = attributes.match(/target=["']body["']/)

    if (typeMatch && targetBodyMatch) {
      scripts.push(value)
      return ''
    }

    if ((typeMatch && targetHeadMatch)) {
      return ''
    }

    return match
  })

  const variables = ctx.variables
  for (const script of scripts) {
    Object.assign(variables, await importDynamicModule(script, {
      cwd: ctx.cwd,
      dir: ctx.dir,
      fileref: ctx.fileref,
      variables: ctx.variables
    }))
  }

  // escape backticks in the content, but not in the variables
  content = splitByTemplateLiterals(content).reduce((content, part) => {
    if (part.type === 'static') return content + part.value.replaceAll('`', '\\`')
    return content + `\${${part.value}}`
  }, '')

  return { content, variables }
}
