import { print, parseString } from './core.js'
import { 'read-file-async' as read_file_async } from './runtime-lib/files.js'

// import { makeEvalForm } from './interpreter.js'
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
  const file = 'std.wuns'
  const text = await read_file_async(file)
  await evalTops(parseString(text, file))
  window.weval = weval
  window.evalString = evalString
  window.evalStringOut = evalStringOut
}
