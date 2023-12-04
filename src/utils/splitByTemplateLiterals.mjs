/**
 * Seperate a string into parts of static and dynamic parts
 * @param {string} str - The string to split.
 * @returns {Array<{type: 'static'|'dynamic', value: string}}>
 */
export default function splitByTemplateLiterals (str) {
  const parts = []

  let currentPart = ''
  let isDynamic = false
  let depth = 0
  for (let i = 0; i < str.length; i++) {
    const previous = i === 0 ? null : str.charAt(i - 1)
    const current = str.charAt(i)

    if (isDynamic) {
      if (current === '{') {
        depth = depth + 1
        if (depth > 1) currentPart = currentPart + current
      } else if (current === '}') {
        depth = depth - 1
        if (depth === 0) {
          isDynamic = false
          parts.push({ type: 'dynamic', value: currentPart })
          currentPart = ''
        } else {
          currentPart = currentPart + current
        }
      } else {
        currentPart = currentPart + current
      }
    } else {
      const next = str.charAt(i + 1)
      if (current === '$' && next === '{') {
        if (previous !== '\\') {
          isDynamic = true
          if (currentPart) {
            parts.push({ type: 'static', value: currentPart })
            currentPart = ''
          }
        } else {
          currentPart = currentPart.slice(0, -1) + current
          if (i === str.length - 1) {
            parts.push({ type: 'static', value: currentPart })
            currentPart = ''
          }
        }
      } else {
        currentPart = currentPart + current
        if (i === str.length - 1) {
          parts.push({ type: 'static', value: currentPart })
          currentPart = ''
        }
      }
    }
  }

  if (currentPart) {
    if (depth > 0) throw new Error(`Invalid template literal. Missing ${depth} '}'`)
    else throw new Error(`Invalid template literal. Unknown: ${currentPart}`)
  }

  return parts
}
