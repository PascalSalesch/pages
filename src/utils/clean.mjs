import * as path from 'node:path'
import * as fs from 'node:fs'

/**
 * Removes all files and directories from the output directory.
 * @param {string} dir - The directory to clean.
 */
export default async function clean (dir) {
  if (!fs.existsSync(dir)) return

  const promises = []
  for (const dirent of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const direntPath = path.resolve(dir, dirent.name)
    if (dirent.isDirectory()) {
      promises.push(clean(direntPath))
    } else {
      if (fs.existsSync(direntPath)) promises.push(fs.promises.unlink(direntPath))
    }
  }
  await Promise.allSettled(promises)

  if (fs.existsSync(dir)) await fs.promises.rmdir(dir)
}
