import { parseString } from '../core.js'
import { makeJSCompilingEvaluator } from '../compiler-js.js'

const filename = 'test-compile-wat.wuns'

import formsString from '../../wuns/test-compile-wat.wuns?raw'

const { evalTops, getDef } = makeJSCompilingEvaluator()
await evalTops(parseString(formsString, filename))
const moduleAsync = getDef('module-async')

export const stringToInst = async (s, importObject) => {
  const forms = parseString(s, 'test-content')
  const module = await moduleAsync(...forms)
  const { exports } = new WebAssembly.Instance(module, importObject)
  return exports
}
