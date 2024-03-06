import * as path from 'node:path'
import * as url from 'node:url'
import threads from 'node:worker_threads'
import os from 'node:os'

import Page from './Page.mjs'

import * as pageInfo from '../utils/getPageInfo.mjs'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const maxWorkers = Math.max(1, os.cpus().length - 1)

const debug = 'ingredients.html2'

/**
 *
 */
export default class Path {
  #workload = null
  #workloadLength = 0
  #pageBuilder = null
  #pageBuilderData = null
  #pageData = null
  #messageHandler = null

  constructor ({ workload, pageBuilder, pageBuilderData, page, pageData }) {
    this.#pageBuilder = pageBuilder
    this.#workload = workload
    this.#workloadLength = workload.length
    this.#pageBuilderData = pageBuilderData
    this.#pageData = pageData
    this.#messageHandler = workerMessageHandler(pageBuilder, page)
  }

  #createWorker () {
    const verbose = this.#pageData.id.endsWith(debug) || this.#pageBuilder.verbose
    return new Promise((resolve, reject) => {
      const worker = new threads.Worker(
        path.resolve(__dirname, 'PathWorker.mjs'),
        {
          stdout: !verbose,
          stderr: !verbose
        }
      )
      worker.setMaxListeners(0)
      worker.memoryUsage = 0
      worker.workload = 0
      worker.totalWorkload = 0
      worker.isAlive = true
      let interval

      worker.once('message', (message) => {
        if (message?.type === 'ready') {
          worker.on('message', this.#messageHandler)
          setTimeout(() => { worker.isAlive = false }, 120000 + (5000 * Math.random())).unref()
          interval = setInterval(() => {
            worker.postMessage({ type: 'memoryUsage' })
          }, 10000)
          interval.unref()
          resolve(worker)
        } else {
          reject(new Error(`Unexpected message from worker: ${message}`))
        }
      })

      worker.on('error', (error) => { if (verbose) console.error(error) })

      worker.on('message', (message) => {
        if (message?.type === 'memoryUsage') worker.memoryUsage = message.memoryUsage
      })

      worker.kill = async () => {
        worker.isAlive = false

        await new Promise((resolve) => {
          const cb = () => {
            if (worker.workload !== 0) return
            clearInterval(interval)
            resolve()
          }
          const interval = setInterval(cb, 100)
          cb()
        })

        clearInterval(interval)
        await worker.terminate()
      }

      worker.build = (workload) => {
        return new Promise((resolve, reject) => {
          const done = (message) => {
            if (message.type !== 'build' || message.build.urlPath !== workload.urlPath) return

            const percent = parseInt((this.#workloadLength - this.#workload.length) / this.#workloadLength * 100)
            const total = `${this.#workloadLength - this.#workload.length}/${this.#workloadLength}`
            if (verbose) console.log(`[Page] ${this.#pageData.id} | ${percent}% | ${total} | ${workload.urlPath}`)

            worker.off('message', done)
            resolve()
          }
          worker.on('message', done)
          worker.on('error', reject)
          worker.postMessage({ type: 'build', build: workload })
        })
      }

      const pageBuilderData = this.#pageBuilderData
      if (verbose) pageBuilderData.verbose = true

      // only keep first 100 urlPaths
      if (Object.keys(pageBuilderData.urlPaths).length > 100) {
        pageBuilderData.urlPaths = Object.fromEntries(Object.entries(pageBuilderData.urlPaths).slice(0, 100))
      }

      worker.postMessage({ type: 'init', init: { pageBuilderData, pageData: this.#pageData } })
    })
  }

  async build () {
    if (!threads.isMainThread) return
    const verbose = this.#pageData.id.endsWith(debug) || this.#pageBuilder.verbose

    let workerNum = Math.min(4, maxWorkers, this.#workload.length)
    if (this.#pageBuilder.workloadManager.getBusyness() > 1) workerNum = 1

    const workers = await Promise.all(new Array(workerNum).fill(null).map(() => this.#createWorker()))

    const interval = setInterval(() => {
      const memory = getMemoryUsageInPercent()
      if (verbose) console.log(`[Page] ${this.#pageData.id} | Memory usage: ${memory}% | Worker amount: ${workers.length}/${workerNum}`)
    }, 10000)

    const maxMemoryUsage = 1 * 1024 * 1024 * 1024 // 1 GB, per worker

    // kills a worker after waiting for it to finish its workload
    const kill = async (worker) => {
      if (verbose) console.log(`[Page] ${this.#pageData.id} | Terminating worker`)
      await worker.kill()
      while (workers.indexOf(worker) !== -1) workers.splice(workers.indexOf(worker), 1)
    }

    let promises = []
    if (this.#pageData.id.endsWith(debug)) console.log(`[Page] ${this.#pageData.id} | Building`, this.#workload.length)
    while (this.#workload.length > 0) {
      promises = promises.filter((promise) => !promise.isDone)
      const memory = getMemoryUsageInPercent()

      // check worker amount
      // the kill function cleans up the workers array
      workers.filter(worker => !worker.isAlive || (worker.memoryUsage > maxMemoryUsage)).map((worker) => kill(worker))
      if (workers.filter(worker => worker.isAlive).length > workerNum) {
        const victim = workers.sort((a, b) => a.memoryUsage - b.memoryUsage)[0]
        if (victim) await kill(victim)
        continue
      }

      if (workers.length < workerNum) {
        const newWorkers = workers.filter(worker => worker.totalWorkload === 0)
        const isSafeToCreateWorker = workers.length < 4 || newWorkers.length < 4
        if (isSafeToCreateWorker) {
          if (verbose) console.log(`[Page] ${this.#pageData.id} | Creating new worker`)
          workers.push(await this.#createWorker())
        }
      }

      // check memory usage
      const createdAllAvailableWorkers = workers.length === workerNum
      const idle = this.#pageBuilder.workloadManager.getBusyness() === 1
      if (memory < 20 && this.#workload.length > workerNum * 4 && createdAllAvailableWorkers && idle) {
        workerNum = Math.min(workerNum + 1, maxWorkers, this.#workload.length)
      }

      if (memory > 35) {
        if (verbose) console.log(`[Page] ${this.#pageData.id} | Memory limit reached, reducing worker number`)
        workerNum -= 1
        continue
      }

      // state
      if (verbose) console.log(`[Page] ${workers.length}/${workerNum} | memory: ${memory}% | `, workers.map(w => `${w.workload}/${w.totalWorkload}`).join(', '))

      // build
      const healthyWorkers = workers.filter((w) => w.isAlive && w.totalWorkload > 0 && w.memoryUsage < maxMemoryUsage).length
      const newWorkers = workers.filter(worker => worker.totalWorkload === 0).length
      const healthy = Math.max(4, ((healthyWorkers * 4) + newWorkers))
      const availableWorker = () => workers.find(worker => worker.isAlive && worker.workload === 0)
      const select = (a, b) => {
        // grace period for new workers
        const ar = a.totalWorkload === 0 && a.workload > 0
        const br = b.totalWorkload === 0 && b.workload > 0
        if (ar && !br) return 1
        if (br && !ar) return -1

        // select worker with least workload, then least total workload
        const r = a.workload - b.workload
        if (r !== 0) return r
        return a.totalWorkload - b.totalWorkload
      }

      while (this.#workload.length && (promises.length < healthy || availableWorker())) {
        const workload = this.#workload.shift()
        const worker = availableWorker() || workers.filter((worker) => worker.isAlive && worker.memoryUsage < maxMemoryUsage).sort(select)?.[0]

        if (!worker) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          break
        }

        worker.workload += 1
        const promise = new Promise((resolve, reject) => {
          const build = worker.build(workload)
          const retry = (forceUnshift) => {
            if (!promise.isDone || forceUnshift) this.#workload.unshift(workload)
            if (promise.isDone) return
            resolve()
          }
          const timeout = setTimeout(retry, 600000)

          build.then(() => {
            clearTimeout(timeout)
            if (!promise.isDone) resolve()
          })

          build.catch((err) => {
            console.error(err)
            retry(true)
          })
        })
        promise.finally(() => { promise.isDone = true; worker.workload -= 1; worker.totalWorkload += 1 })
        promises.push(promise)
      }

      if (workers.length < workerNum) {
        const promise = new Promise((resolve) => setTimeout(resolve, 2000))
        promise.isDone = true
        promises.push(promise)
      }

      const canTakeMoreWork = this.#workload.length && promises.length < healthy
      if (canTakeMoreWork && workers.find(worker => worker.workload < 3)) continue
      else if (promises.length) await Promise.race(promises)
    }

    await Promise.all(promises.filter((promise) => !promise.isDone))
    await Promise.all(workers.map((worker) => worker.kill()))
    clearInterval(interval)
  }
}

function workerMessageHandler (pageBuilder, page) {
  return async function (message) {
    const worker = this

    if (!message.type) return
    const response = (data) => worker.postMessage({ type: message.type, [message.type]: data, messageId: message.messageId })

    if (message.type === 'updateUrlPaths') {
      const urlPath = message.updateUrlPaths
      const id = pageInfo.getId(urlPath, { ...pageBuilder })
      response({ [urlPath]: id })
    }

    if (message.type === 'addSource') {
      for (const source of message.addSource) page.addSource(source)
      response()
    }

    if (message.type === 'addSubpage') {
      for (const subpage of message.addSubpage) page.addSubpage(subpage)
      response()
    }

    if (message.type === 'getOrCreateSubpage') {
      const subpage = page.getOrCreateSubpage(message.getOrCreateSubpage.id, { rel: message.getOrCreateSubpage.rel, cwd: pageBuilder.cwd, pageBuilder })
      pageBuilder.workloadManager.prioritize(subpage.id)
      page.addSubpage(subpage.id)
      response({ id: subpage.id })
    }

    if (message.type === 'waitForSubpages') {
      for (const id of page.getSubpages()) {
        pageBuilder.workloadManager.prioritize(id)
        const page = Page.pages[pageInfo.getId(id)]
        if (!page) throw new Error(`Page with id "${id}" does not exist`)
        const pageBuilderPage = pageBuilder.pages.find((page) => page.id === id)
        if (!pageBuilderPage) pageBuilder.pages.push(page)
      }
      response()
    }

    if (message.type === 'subpageBuild') {
      const page = pageBuilder.pages.find((page) => page.id === message.subpageBuild.id)
      await page.getBuildProgress(pageBuilder)
      response()
    }

    if (message.type === 'getUrlPaths') {
      const id = message.getUrlPaths.id
      const urlPaths = Object.entries(pageBuilder.urlPaths).filter(([_key, value]) => value === id)
      if (urlPaths.length === 0) throw new Error(`Page with id "${id}" has not been build, yet.`)
      response(urlPaths)
    }
  }
}

function getMemoryUsageInPercent () {
  return Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100)
}
