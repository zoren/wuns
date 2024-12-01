import { parseString } from '../core.js'
import { makeJSCompilingEvaluator, CompileError } from '../compiler-js.js'

const filename = 'test-compile-wat.wuns'

import formsString from '../../wuns/test-compile-wat.wuns?raw'

export const makeStringToInst = async () => {
  const { evalTops, getDef } = makeJSCompilingEvaluator()
  try {
    await evalTops(parseString(formsString, filename))
  } catch (e) {
    if (e instanceof CompileError) {
      console.error(e, e.form ?? 'no form')
      // console.error(e.form)
    }
    throw e
  }
  const moduleAsync = getDef('module-async')
  return async (s, importObject) => {
    const forms = parseString(s, 'test-content')
    const module = await moduleAsync(...forms)
    const { exports } = new WebAssembly.Instance(module, importObject)
    return exports
  }
}
