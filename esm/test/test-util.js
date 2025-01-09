import { parseString } from '../core.js'
import { makeJSCompilingEvaluator, CompileError } from '../compiler-js.js'

const filename = 'test-compile-wat.wuns'

import formsString from '../../wuns/test-compile-wat.wuns?raw'

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

const translateFormsToModule = getDef('translate-top-forms-to-module')

export const stringToInst = async (s, fileName = 'test-content', importObject) => {
  const forms = parseString(s, fileName)
  const module = await translateFormsToModule(forms)
  const { exports } = new WebAssembly.Instance(module, importObject)
  return exports
}

export const translateFormsToWasmBytes = getDef('translate-top-forms-to-wasm-bytes')
