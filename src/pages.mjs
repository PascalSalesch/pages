#!/usr/bin/env node

import * as fs from 'node:fs'
import * as url from 'node:url'
import * as path from 'node:path'

import PageBuilder from './classes/PageBuilder.mjs'
import * as defaultPagesRc from '../pagesrc.mjs'
import getCliArgs from './utils/getCliArgs.mjs'

// run the main function if this file is executed directly from cmd
process.nextTick(async () => {
  const cwd = getCliArgs('cwd', 'string', { defaultValue: undefined })
  const output = getCliArgs('output', 'string', { defaultValue: undefined })
  const port = getCliArgs('port', 'string', { defaultValue: undefined })
  const watch = getCliArgs('watch', 'flag', { defaultValue: undefined })
  const verbose = getCliArgs('verbose', 'flag', { defaultValue: undefined })
  const prefix = getCliArgs('prefix', 'string', { defaultValue: '' })
  const suffix = getCliArgs('suffix', 'string', { defaultValue: '' })
  const keep = getCliArgs('keep', 'list', { defaultValue: [] })
  await main({ cwd, output, watch, port, verbose, prefix, suffix, keep })
})

/**
 * @fileoverview This file exports all functionality of the pages module.
 */
async function main (options = {}) {
  options.cwd = options.cwd ? path.isAbsolute(options.cwd) ? options.cwd : path.resolve(process.cwd(), options.cwd) : process.cwd()

  // retrieve the config from pagesrc.mjs
  const pagesRcFiles = [
    path.resolve(options.cwd, 'pagesrc.mjs'),
    path.resolve(options.cwd, '.pagesrc.mjs'),
    path.resolve(options.cwd, 'pagesrc.js'),
    path.resolve(options.cwd, '.pagesrc.js')
  ]
  const pagesrcFile = pagesRcFiles.find(file => fs.existsSync(file))
  const pagesrc = {}
  if (pagesrcFile && options.pagesrcFile !== false) Object.assign(pagesrc, await import(url.pathToFileURL(pagesrcFile).href))

  // execute userland "before" function
  if (typeof pagesrc.before === 'function') {
    const pagesrcUserlandConfig = await pagesrc.before()
    if (pagesrcUserlandConfig) Object.assign(pagesrc, pagesrcUserlandConfig)
  }

  // parse the config
  const config = Object.assign({ ...defaultPagesRc }, pagesrc.default || {}, { ...pagesrc, default: undefined })
  for (const [key, value] of Object.entries(config)) if (typeof value === 'undefined') delete config[key]

  // override the config with the options
  config.cwd = options.cwd
  if (options.output) config.output = path.isAbsolute(options.output) ? options.output : path.resolve(process.cwd(), options.output)
  if (options.watch === true || options.watch === false) config.watch = options.watch
  if (options.verbose === true || options.verbose === false) config.verbose = options.verbose
  if (options.port || !config.port) config.port = options.port || 8080
  if (options.prefix) config.prefix = options.prefix
  if (options.suffix) config.suffix = options.suffix
  if (options.keep) config.keep = options.keep

  // create a new PageBuilder instance
  const builder = new PageBuilder(config)

  // build files
  await builder.build()

  // start a webserver and watch for changes if the watch option is set
  if (config.watch) {
    const watch = (await import('./watch.mjs')).default
    await watch(builder, config)
  }

  // execute userland "after" function
  if (typeof pagesrc.after === 'function') {
    await pagesrc.after()
  }

  // return the PageBuilder instance
  return builder
}
