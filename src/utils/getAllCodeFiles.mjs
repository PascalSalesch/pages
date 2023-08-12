import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Read all files in a directory and return an array of file paths.
 * Reads recursively and ignores files and directories in .gitignore.
 * @param {string} dir - The directory to read.
 * @param {object} [options={}] - Options.
 * @param {string[]} [options.files=[]] - The files that have already been read.
 * @param {string[]} [options.ignore=[]] - An array of regular expressions for files that should be ignored.
 * @returns {Promise<string[]>} - The files that have been read.
 */
export default async function getAllCodeFiles (dir, options = {}) {
  if (!fs.existsSync(dir)) return options.files || []
  const gitignoreFile = path.resolve(dir, '.gitignore')
  const ignore = options.ignore || (fs.existsSync(gitignoreFile) ? await getRegExpForIgnoredFiles(gitignoreFile) : [])

  // read all files and directories
  const files = options.files || []
  for (const dirent of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const filepath = path.resolve(dir, dirent.name)
    if (ignore.some((regex) => regex.test(filepath))) continue
    if (dirent.isDirectory()) {
      if (ignore.some((regex) => regex.test(filepath + '/'))) continue
      await getAllCodeFiles(filepath, { ...options, files, ignore })
    } else {
      files.push(filepath)
    }
  }

  return files
}

/**
 * Get an array of regular expressions for all files that are ignored by git.
 * @param {string} gitignoreFile - The path to the .gitignore file.
 * @returns {Promise<RegExp[]>}
 */
async function getRegExpForIgnoredFiles (gitignoreFile) {
  const gitignore = await fs.promises.readFile(gitignoreFile, { encoding: 'utf-8' })
  const lines = gitignore.split('\n')
  const ignore = []
  for (const line of ['.gitignore', '.git', ...lines]) {
    if (line.startsWith('#') || line.trim() === '') continue
    // convert glob to regex
    const regexStr = line.trim().replaceAll('.', '\\.').replaceAll('*', '.*').replaceAll('/', '\\/')
    ignore.push(new RegExp(regexStr, 'i'))
  }
  return ignore
}
