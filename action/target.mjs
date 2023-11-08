import * as os from 'node:os'
import * as fs from 'node:fs'
import * as cmd from 'node:child_process'
import * as path from 'node:path'

import * as core from '@actions/core'
import * as github from '@actions/github'

// The source repository to build from.
const ref = core.getInput('target')
  .replace('{repo}', github.context.repo.repo)
  .replace('{org}', github.context.repo.owner)
  .replace('{branch}', github.context.ref.replace('refs/heads/', ''))

// The source repository to build from.
const repo = ref.split('@')[0]

// The source branch to build from.
export const branch = ref.split('@').slice(1).join('@')

// The source repository to build from.
const token = core.getInput('targetToken')

// Octokit instance for the source repository.
const octokit = github.getOctokit(token)

/**
 * Sets up the target git repository.
 * @returns {Promise<string>} The target directory.
 */
export default async function setupTargetDir () {
  const tmpDir = os.tmpdir()
  const tmp = path.resolve(tmpDir, `target-${repo.replace(path.sep, '-')}-${branch}`)
  const cmdOptions = { cwd: tmp, stdio: 'inherit' }
  fs.mkdirSync(tmp, { recursive: true })

  // Get the user information
  const user = await getUser()

  // Initialize git
  cmd.execSync('git init', Object.assign({}, cmdOptions, { stdio: 'ignore' }))
  cmd.execSync('git config --local credential.helper store', cmdOptions)
  cmd.execSync(`git config --local user.email "${user.email}"`, cmdOptions)
  cmd.execSync(`git config --local user.name "${user.login}"`, cmdOptions)
  cmd.execSync(`printf "protocol=https\nhost=github.com\nusername=${user.login}\ntoken=${token}\n" | git credential approve`, cmdOptions)

  // to fix missing git permissions
  cmd.execSync(`git config --local url."https://${user.login}:${token}@github.com".insteadOf ssh://git@github.com`, cmdOptions)

  // Set origin and pull
  const cloneUrl = `https://${user.login}:${token}@github.com/${repo}.git`
  cmd.execSync(`git remote add origin ${cloneUrl}`, cmdOptions)
  if (doesBranchExist(branch, { cwd: cmdOptions.cwd })) {
    cmd.execSync(`git pull origin ${branch}`, cmdOptions)
    cmd.execSync(`git checkout ${branch}`, cmdOptions)
  } else {
    cmd.execSync(`git checkout --orphan ${branch}`, cmdOptions)
  }

  // Return the source directory
  return tmp
}

/**
 * Gets the user information.
 * @returns {Promise<{login: string, email: string}>} The user information.
 */
async function getUser () {
  try {
    const user = (await octokit.request('GET /user')).data
    return user
  } catch (err) {
    return {
      login: 'github-actions',
      email: '41898282+github-actions[bot]@users.noreply.github.com'
    }
  }
}

/**
 * Checks if a branch exists.
 * @param {string} branchName The branch name.
 * @param {object} [options] The options.
 * @param {string} [options.cwd] The working directory.
 * @returns {boolean} `true` if the branch exists.
 */
function doesBranchExist (branchName, options = {}) {
  try {
    const r = cmd.execSync(`git ls-remote --heads origin ${branchName}`, { cwd: options.cwd, encoding: 'utf-8' })
    return r.trim().length > 0
  } catch (error) {
    return false
  }
}
