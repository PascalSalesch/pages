import * as os from 'node:os'
import * as fs from 'node:fs'
import * as cmd from 'node:child_process'
import * as path from 'node:path'

import * as core from '@actions/core'
import * as github from '@actions/github'

// The source repository to build from.
const ref = core.getInput('source')
  .replace('{repo}', github.context.repo.repo)
  .replace('{org}', github.context.repo.owner)
  .replace('{branch}', github.context.ref.replace('refs/heads/', '').trim().replace(/[^a-zA-Z0-9-_]/g, ''))

// The source repository to build from.
const repo = ref.split('@')[0]

// The source branch to build from.
const branch = ref.split('@').slice(1).join('@')

// The source repository to build from.
const token = core.getInput('sourceToken')

// Octokit instance for the source repository.
const octokit = github.getOctokit(token)

/**
 * Checks out the source repository.
 * @returns {Promise<string>} The source directory.
 */
export default async function setupSourceDir () {
  const tmpDir = os.tmpdir()
  const tmp = path.resolve(tmpDir, `source-${repo.replace(path.sep, '-')}-${branch}`)
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
  cmd.execSync(`git pull origin ${branch}`, cmdOptions)
  cmd.execSync(`git checkout ${branch}`, cmdOptions)

  // install dependencies
  cmd.execSync('npm install --production', { cwd: tmp, stdio: 'inherit' })

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
