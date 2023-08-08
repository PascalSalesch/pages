import * as os from 'node:os'
import * as url from 'node:url'
import * as path from 'node:path'
import * as cmd from 'node:child_process'
import * as fs from 'node:fs'

import * as core from '@actions/core'
import * as github from '@actions/github'

import setupSourceDir from './source.mjs'
import setupTargetDir, { branch as targetBranch } from './target.mjs'

import getAllCodeFiles from '../src/utils/getAllCodeFiles.mjs'

// Get the absolute path to this file
const __filename = url.fileURLToPath(import.meta.url)

// The repository that initiated the action
const actionRepo = `${github.context.repo.owner}/${github.context.repo.repo}`

// the output directory
const output = core.getInput('targetOutput')

// The prefix to use for the output directory
const prefix = core.getInput('prefix')

// The suffix to use for the output directory
const suffix = core.getInput('suffix')

// List of RegExp patterns to keep
const keep = [
  ...(core.getInput('targetKeep').split(',').filter(p => Boolean(p)).map((pattern) => new RegExp(pattern.trim(), 'i'))),
  /^\.git/
]

// run the main function if this file is executed directly from cmd
if (__filename === path.resolve(process.argv[1])) process.nextTick(main)

/**
 *
 */
export default async function main () {
  const tmpDir = os.tmpdir()
  const tmp = path.resolve(tmpDir, `output-${Date.now()}`)
  fs.mkdirSync(tmp, { recursive: true })

  // create the source and target directories
  const source = await setupSourceDir()
  const target = await setupTargetDir()
  const targetOutput = path.resolve(target, ...output.split(path.sep).filter(Boolean))

  // clean the target directory
  const files = await getAllCodeFiles(targetOutput)
  for (const file of files) {
    const f = path.relative(targetOutput, file)
    if (keep.some((regex) => regex.test(f))) continue
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }

  // find the root, where package.json exists
  const dirs = path.dirname(__filename).split(path.sep).map((_, i, a) => a.slice(0, a.length - i).join(path.sep))
  const root = dirs.find(dir => fs.existsSync(path.resolve(dir, 'package.json')))

  // build the pages
  cmd.execSync('npm install --production', { cwd: root, stdio: 'inherit' })
  cmd.execSync(`node . --cwd=${source} --output=${tmp} --prefix=${prefix} --suffix=${suffix} --verbose`, { cwd: root, stdio: 'inherit' })

  // commit changes
  try {
    const options = { cwd: target, stdio: 'inherit' }
    cmd.execSync(`mv ${tmp}/${prefix ? `${prefix}/*` : '*'} ${targetOutput}`, options)
    cmd.execSync('git add .', options)
    cmd.execSync(`git commit -m "Page Update\nFrom: https://github.com/${actionRepo}/actions/runs/${github.context.runId}"`, options)
    cmd.execSync(`git push origin ${targetBranch}`, options)
  } catch (err) {
    // no need to throw an error if there is nothing to commit
    // todo: check the error message
    console.error(err)
  }
}
