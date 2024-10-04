import { parseToForms, evalForm, makeDefEnv } from './mini-lisp.js'
import { compile, evalInst } from './compiler.js'

const interpretForm = (form) => evalForm(makeDefEnv(), form)

const wunsSource = `
[i32 007] [i32 7]
[f64 1.5] [f64 1.5]
[word abc] [word abc]
[[intrinsic instructions i32.add] [i32 2] [i32 3]] [i32 5]
[[intrinsic instructions i32.sub] [i32 8] [i32 3]] [i32 5]
[switch [i32 0]
    [i32 0] [word zero]
    [i32 1] [word one]
    [word not-01]] [word zero]
[switch [i32 1]
    [i32 0] [word zero]
    [i32 1] [word one]
    [word not-01]] [word one]
[switch [i32 10]
    [i32 0] [word zero]
    [i32 1] [word one]
    [word not-01]] [word not-01]
`
const wunsForms = [...parseToForms(wunsSource, 'test.wuns')]
const run = (f) => {
  let assertsRun = 0
  for (let i = 0; i < wunsForms.length; i += 2) {
    const form = wunsForms[i]
    const expected = interpretForm(wunsForms[i + 1])
    const actual = f(form)
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
