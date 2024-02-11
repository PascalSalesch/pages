import * as url from 'node:url'
import * as threads from 'node:worker_threads'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as crypto from 'node:crypto'

import Page from './Page.mjs'
import PageBuilder from './PageBuilder.mjs'

import * as pageInfo from '../utils/getPageInfo.mjs'
import getContent from '../utils/getContent.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let messageNum = 0

threads.parentPort.on('message', async (message) => {
  if (!message.type) return
  if (message.type === 'workload' && message.workload) {
    const pagesrc = await import(url.pathToFileURL(message.pageBuilderData.options.pagesrcFile).href)
    const pageBuilderOptions = Object.assign(
      message.pageBuilderData.options,
      await import(url.pathToFileURL(path.resolve(__dirname, '..', '..', 'pagesrc.mjs')).href),
      pagesrc,
      { default: undefined }
    )

    const pageBuilder = new PageBuilder(pageBuilderOptions)
    if (pageBuilder.loading) await pageBuilder.loading
    for (const property in message.pageBuilderData) {
      if (property === 'options' || property.startsWith('_')) continue
      pageBuilder[property] = message.pageBuilderData[property]
    }

    const page = new Page(message.pageData.id)
    page.rel = message.pageData.rel

    // execute userland "beforeEach" function
    if (typeof pagesrc.beforeEachWorker === 'function') {
      await pagesrc.beforeEachWorker()
    }

    // execute the workload in chunks
    const chunkSize = message.chunkSize || 20
    for (let i = 0; i < message.workload.length; i += chunkSize) {
      const chunk = message.workload.slice(i, i + chunkSize)
      const promises = []
      for (const workload of chunk) {
        promises.push((async () => {
          // execute userland "beforeEach" function
          if (typeof pagesrc.beforeEach === 'function') {
            await pagesrc.beforeEach()
          }

          await buildPath.call(page, workload.urlPath, { ...workload, pageBuilder })

          // execute userland "afterEach" function
          if (typeof pagesrc.afterEach === 'function') {
            await pagesrc.afterEach()
          }
        })())
      }
      await Promise.all(promises)
    }

    // execute userland "afterEachWorker" function
    if (typeof pagesrc.afterEachWorker === 'function') {
      await pagesrc.afterEachWorker()
    }

    threads.parentPort.postMessage({ type: 'done' })
  }
})

function message (type, data) {
  return new Promise((resolve) => {
    messageNum = messageNum + 1
    const messageId = messageNum
    const cb = (message) => {
      if (message.messageId === messageId) {
        threads.parentPort.off('message', cb)
        resolve(message[type])
      }
    }
    threads.parentPort.on('message', cb)
    threads.parentPort.postMessage({ type, [type]: data, messageId })
  })
}

/**
 * Builds a path.
 * @param {string} urlPath - The path to the page.
 * @param {object} options - Options.
 * @param {import('./PageBuilder.mjs').default} options.pageBuilder - The PageBuilder instance.
 * @param {object} options.variables - All static and dynamic path part values.
 * @param {object} [options.replace={}] - The values to replace in the content.
 */
export default async function buildPath (urlPath, options = {}) {
  if (options.pageBuilder.verbose) console.log(`[Page] Building ${urlPath} from ${this.id}`)

  // get content and sources
  options.variables = Object.assign(options.variables, options.pageBuilder.getVariables(this))
  const { content, sources } = await (async () => {
    try {
      const pageBuilderResult = await options.pageBuilder.getContentAndSources(this, { variables: options.variables, replace: options.replace })
      if (pageBuilderResult.content) return pageBuilderResult
      return pageInfo.getContentAndSources(this)
    } catch (err) {
      options.pageBuilder.urlPaths = await message('updateUrlPaths')
      const pageBuilderResult = await options.pageBuilder.getContentAndSources(this, { variables: options.variables, replace: options.replace })
      if (pageBuilderResult.content) return pageBuilderResult
      return pageInfo.getContentAndSources(this)
    }
  })()

  // add files that modify the content as dependencies.
  await message('addSource', sources)

  // Create sub-pages
  const { dependencies } = await options.pageBuilder.getDependencies(this, { urlPath, content, variables: options.variables })
  for (const { id, rel } of dependencies) {
    await message('getOrCreateSubpage', { id, rel })
  }

  // create the file content
  let fileContent = dependencies.length ? await getContent(content) : content

  // Wait for sub-pages to be build
  await message('waitForSubpages')

  // wait for the urlPath to be available for all sub-pages.
  // this works with circular dependencies because `urlPaths` is set before the build is done
  const subpageBuildPromises = []
  for (const { id } of dependencies) {
    const urlPaths = Object.values(options.pageBuilder.urlPaths).find(urlId => urlId === id)
    if (urlPaths) continue
    subpageBuildPromises.push(message('subpageBuild', { id }))
  }
  await Promise.all(subpageBuildPromises)

  if (options.pageBuilder.verbose) console.log(`[Page] Subpages of ${urlPath} are ready from ${this.id}`)

  // wait for dependencies with integrity checks to be done building
  // additionally rebuild the page when the dependencies hash changes
  const integrityCheckPromises = []
  for (const { id, outerHTML } of dependencies) {
    if (!(outerHTML.includes('integrity='))) continue
    if (id === this.id) continue
    integrityCheckPromises.push(message('subpageBuild', { id }))
    await message('addSource', [id])
  }
  await Promise.all(integrityCheckPromises)

  // replace the dependencies src with the url path
  const variableValues = Object.values(options.variables).flat().filter((v) => typeof v === 'string') || []
  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const uniqueOuterHTML = dependencies.reduce((uniqueOuterHTML, dependency) => {
    uniqueOuterHTML[dependency.outerHTML] = uniqueOuterHTML[dependency.outerHTML] || []
    uniqueOuterHTML[dependency.outerHTML].push(dependency)
    return uniqueOuterHTML
  }, {})

  for (const dependencies of Object.values(uniqueOuterHTML)) {
    let outerHTML = dependencies[0].outerHTML

    for (const dependency of dependencies) {
      const { id } = dependency
      let { src } = dependency
      src = src.includes('#') ? src.split('#')[0] : src

      // find all url paths that point to the dependency
      const urlPaths = await (async () => {
        const urlPaths = Object.entries(options.pageBuilder.urlPaths).filter(([_key, value]) => value === id)
        if (urlPaths.length > 0) return urlPaths
        return await message('getUrlPaths', { id })
      })()

      // find the path that has more variable values in the url
      const [urlPath] = (urlPaths.sort((a, b) => {
        const aSrc = a[0].includes(src)
        const bSrc = b[0].includes(src)
        if (aSrc && !bSrc) return -1
        if (!aSrc && bSrc) return 1
        const aCount = variableValues.map(value => a[0].split(value).length - 1).reduce((current, next) => current + next, 0)
        const bCount = variableValues.map(value => b[0].split(value).length - 1).reduce((current, next) => current + next, 0)
        return bCount - aCount
      })[0])

      const replace = (...args) => {
        const newOuterHTML = outerHTML.replace(...args)
        fileContent = fileContent.replace(outerHTML, newOuterHTML)
        outerHTML = newOuterHTML
      }

      // securely replace the outerHTML, unless the html has been automatically adjusted
      replace(src, urlPath)
      if (outerHTML.includes('srcset')) {
        const regex = new RegExp(`srcset=["']([^"']*)${escapeRegExp(src)}([^"']*)["']`, 'gi')
        replace(regex, `srcset="$1${urlPath}$2"`)
      }

      // replace the src, unless the html has been automatically adjusted
      const regex = new RegExp(`(src|href|action|data-src)=["']${escapeRegExp(src)}["']`, 'gi')
      replace(regex, `$1="${urlPath}"`)

      // add the integrity hash if it is not already there
      if (id !== this.id && outerHTML.includes('integrity=')) {
        const algorithm = outerHTML.match(/integrity=["']([^"']*)["']/)[1]
        if (!(algorithm.includes('-'))) {
          const hash = crypto.createHash(algorithm)
          const content = await fs.promises.readFile(path.resolve(options.pageBuilder.output, ...urlPath.split('/')), { encoding: 'utf-8' })
          const integrity = (hash.update(content) && hash).digest('base64')

          const outerTags = [
            ...(fileContent.matchAll(new RegExp(`<[^>]+${urlPath}[^>]+integrity="([^"]*)"`, 'gi')) || []),
            ...(fileContent.matchAll(new RegExp(`<[^>]+integrity="([^"]*)"[^>]+${urlPath}`, 'gi')) || [])
          ].map((match) => match[0])
          for (const outerTag of outerTags) {
            replace(outerTag, outerTag.replace(/integrity=["']([^"']*)["']/, `integrity="${algorithm}-${integrity}"`))
          }

          // add the integrity hash to the Content-Security-Policy
          const meta = fileContent.match(/<meta[^<]*?Content-Security-Policy.*?>/i)?.[0]
          if (meta) {
            const directive = outerHTML.trim().startsWith('<script') ? 'script-src' : 'style-src'
            const policy = `'${algorithm}-${integrity}'`
            const csp = meta.match(/content="([^"]*)"/i)[1]
            const updatedCSP = csp.includes(directive)
              ? csp.split(';').map(part => {
                if (!(part.trim().startsWith(directive))) return part
                if (part.includes("'self'")) return part
                if (part.includes(policy)) return part
                return `${part} ${policy}`
              }).join(';')
              : `${csp.endsWith(';') ? csp : `${csp};`} ${directive} ${policy};`
            const updatedMeta = meta.replace(csp, updatedCSP)
            fileContent = fileContent.replace(meta, updatedMeta)
          }
        }
      }
    }
  }

  // // emit event to modify the content
  fileContent = await options.pageBuilder.transform(this, { content: fileContent, url: urlPath })

  // write the file
  const output = path.resolve(options.pageBuilder.output, ...urlPath.split('/'))
  if (options.pageBuilder.verbose) console.log(`[Page] Writing ${urlPath} to ${output}`)
  if (!fs.existsSync(path.dirname(output))) await fs.promises.mkdir(path.dirname(output), { recursive: true })
  if (typeof fileContent === 'string') {
    await fs.promises.writeFile(output, fileContent, { encoding: 'utf-8' })
  } else {
    // write file from ReadableStream
    const writeStream = fs.createWriteStream(output)
    fileContent.pipe(writeStream)
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })
  }
}
