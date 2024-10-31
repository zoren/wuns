import { print, parseString } from './core.js'
import { makeEvalForm } from './interpreter.js'
import { 'read-file-async' as read_file_async } from './runtime-lib/files.js'

const { evalTop, evalExp } = makeEvalForm()

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
    for (const form of forms) res = await evalTop(form)
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
  const file = 'test-compile-wat.wuns'
  const text = await read_file_async(file)
  for (const form of parseString(text, file)) await evalTop(form)
  window.weval = weval
  window.evalString = evalString
  window.evalStringOut = evalStringOut
}
