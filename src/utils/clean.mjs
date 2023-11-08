import * as path from 'node:path'
import * as fs from 'node:fs'

/**
 * Removes all files and directories from the output directory.
 * @param {string} dir - The directory to clean.
 * @param {object} [options] - The options object.
 * @param {string[]} [options.keep] - An array of file/directory names to keep.
 */
export default async function clean (dir, options = {}) {
  if (!fs.existsSync(dir)) return
  if (options.keep && options.keep.find(keep => dir.endsWith(keep))) return

  const promises = []
  for (const dirent of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const direntPath = path.resolve(dir, dirent.name)
    if (options.keep && options.keep.find(keep => direntPath.endsWith(keep))) continue
    if (dirent.isDirectory()) {
      promises.push(clean(direntPath))
    } else {
      if (fs.existsSync(direntPath)) promises.push(fs.promises.unlink(direntPath))
    }
  }
  await Promise.allSettled(promises)

  // delete the directory if nothing was kept
  if (fs.existsSync(dir)) {
    const files = await fs.promises.readdir(dir)
    if (files.length === 0) await fs.promises.rmdir(dir)
  }
}
