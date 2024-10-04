import fs from 'fs'
import { parseToForms, evalForm, makeDefEnv } from './mini-lisp.js'
import { compile, evalInst } from './compiler.js'

const interpretForm = (form) => evalForm(makeDefEnv(), form)

const wunsSource = fs.readFileSync('../wuns/test-eval.wuns', 'utf8')
const wunsForms = [...parseToForms(wunsSource, 'test.wuns')]
const run = (f) => {
  let assertsRun = 0
  for (let i = 0; i < wunsForms.length; i += 2) {
    const actual = f(wunsForms[i])
    const expected = interpretForm(wunsForms[i + 1])
    if (actual !== expected) {
      console.log('expected', expected)
      console.log('actual', actual)
    }
    assertsRun++
  }
  console.log('assertsRun', assertsRun)
}

const compileEval = (form) => {
  const inst = compile(form)
  const resultStack = evalInst()(inst)
  if (resultStack.length !== 1) {
    console.log('expected 1 result')
    console.log('actual', resultStack.length)
    throw new Error('expected 1 result')
  }
  return resultStack[0]
}

console.log('compile to instructions and evaluate')
run(compileEval)

console.log('interpret form directly')
run(interpretForm)
