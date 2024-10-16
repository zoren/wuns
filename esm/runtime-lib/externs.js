import { wrapJSFunctionsToObject } from '../utils.js'

const wrap = async (filename) => wrapJSFunctionsToObject(Object.values(await import(filename)))

const host = await wrap('./host.js')

const performance_now = () => performance.now()

const js = await wrap('./js-utils.js')

const externs = {
  host,
  'performance-now': performance_now,
  js,
}

export default externs
