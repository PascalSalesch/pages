/**
 * Transforms an array of strings and arrays to an array of objects.
 * @param {Array<string|string[]>} - The url parts.
 * @returns {Array<{path:string,variables:any[]}>}
 */
export default function transformUrlParts (urlParts = [], result = []) {
  for (const part of urlParts) {
    if (Array.isArray(part)) {
      if (!result.length) result.push({ path: '', variables: [] })
      const newResult = []
      for (const p of part) {
        const arr = [...result].map((result) => {
          return {
            path: result.path + p,
            variables: [...result.variables, p]
          }
        })
        newResult.push(arr)
      }
      result = newResult.flat()
    } else {
      if (!result.length) {
        result.push({ path: `${part}`, variables: [part] })
      } else {
        result.forEach(result => {
          result.path = result.path + part
          result.variables.push(part)
        })
      }
    }
  }
  return result
}
