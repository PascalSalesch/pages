/**
 * Retrieve the content of a readable stream or return the content if it's a string.
 * @param {string|ReadableStream} content - The content of the file.
 * @returns {Promise<string>}
 */
export default async function getContent (content) {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (typeof content !== 'object') throw new Error(`The content must be a string or a readable stream, but it is a ${typeof content}.`)

  if (typeof content.pipe === 'function') {
    const chunks = []
    return new Promise((resolve, reject) => {
      content.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      content.on('error', (err) => reject(err))
      content.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
  }

  return JSON.stringify(content, null, 2)
}
