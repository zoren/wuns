import { makeDefEnv, readFile, evaluateForms, catchErrors, parseToForms } from './mini-lisp.js'

const forms = [...readFile('../wuns/std.wuns'), ...readFile('../wuns/compile-js.wuns')]

const defEnv = makeDefEnv()

evaluateForms(defEnv, forms)

const testForm = [...parseToForms(`[[intrinsic i32.add] [i32 2] [i32 3]]`, 'test')][0]
console.log(testForm)
const res = defEnv.get('compile-top')(testForm)
const jsBinopToString = (op) => {
  switch (op) {
    case 'binop/add': return '+'
    case 'binop/binary-ior': return '|'
    default: throw new Error(`unknown op: ${op}`)
  }
}
const jsExpToString = (js) => {
  const {tag, args} = js
  switch (tag) {
    case 'js-exp/number': return args[0]
    case 'js-exp/string': return `'${args[0]}'`
    case 'js-exp/binop': {
      const op = jsBinopToString(args[0].tag)
      return `(${jsExpToString(args[1])} ${op} ${jsExpToString(args[2])})`}

    default: throw new Error(`unknown js tag: ${tag}`)
  }
}
const jsStmtToString = (js) => {
  const {tag, args} = js
  switch (tag) {
    case 'js-stmt/return': return `return ${jsExpToString(args[0])}`

    default: throw new Error(`unknown js tag: ${tag}`)
  }
}
const jsSrc = jsStmtToString(res)
console.log(jsSrc)
const runFunc = new Function(jsSrc)
console.log('res', runFunc())