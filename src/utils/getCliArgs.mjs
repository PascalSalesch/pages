/**
 * Retrieve CLI arguments.
 * @param {string} name - The name of the argument.
 * @param {"string"|"list"|"flag"} type - The type of the argument.
 * @param {object} [options={}] - The options.
 * @param {any} [options.defaultValue=undefined] - The default value of the argument. False for flags. Undefined for strings and lists.
 */
export default function getCliArgs (name, type = 'string', options = {}) {
  const args = process.argv.slice(2)

  // handle flags
  if (type === 'flag') {
    const yes = args.findLastIndex(arg => arg === `--${name}`)
    const no = args.findLastIndex(arg => arg === `--no-${name}`)
    const maybe = args.findLastIndex(arg => arg.startsWith(`--${name}=`))
    if (maybe !== -1 && maybe > yes && maybe > no) {
      const arg = args[maybe]
      const value = arg.split('=').slice(1).join('=').toLowerCase()
      if (['yes', 'true', '1'].includes(value)) return true
      if (['no', 'false', '0'].includes(value)) return false
    }
    if (yes !== -1 && yes > no) return true
    if (no !== -1 && no > yes) return false
    return (options.defaultValue !== false) ? options.defaultValue : false
  }

  // exit early if the argument is not present
  const index = args.findLastIndex(arg => arg === `--${name}` || arg.startsWith(`--${name}=`))
  if (index === -1) return options.defaultValue

  // handle strings
  if (type === 'string') {
    const arg = args[index]
    if (arg.startsWith(`--${name}=`)) return arg.split('=').slice(1).join('=')
    else return args[index + 1]
  }

  // handle lists
  if (type === 'list') {
    const values = args.map((arg, index, args) => {
      if (arg.startsWith(`--${name}=`)) return arg.split('=').slice(1).join('=')
      else if (arg === `--${name}`) return args[index + 1]
      return null
    }).filter(value => value !== null)
    return values
  }

  // throw an error if the type is invalid
  throw new Error(`Invalid type: ${type}`)
}
