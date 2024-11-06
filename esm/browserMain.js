import { print, parseString } from './core.js'
import { makeJSCompilingEvaluator } from './compiler-js.js'
const { evalTops, evalExp } = makeJSCompilingEvaluator()

const weval = (s) => {
  const forms = parseString(s, `repl-${replLineNo++}`)
  let res
  for (const form of forms) res = evalExp(form)
  return res
}

let replLineNo = 0

const evalStringOut = async (s) => {
  const forms = parseString(s, `repl-${replLineNo++}`)
  try {
    let res
    await evalTops(forms)
    return res
  } catch (e) {
    console.error(e)
    let curErr = e
    while (curErr) {
      console.error(curErr.message, print(curErr.form))
      curErr = curErr.innerError
    }
  }
}

const evalString = async (s) => {
  const res = await evalStringOut(s)
  console.log(print(res))
}

export const main = async () => {
  const { default: text } = await import('../wuns/test-compile-wat.wuns?raw')
  await evalTops(parseString(text, 'file'))
  await evalString('[test]')
  window.weval = weval
  window.evalString = evalString
  window.evalStringOut = evalStringOut
}
