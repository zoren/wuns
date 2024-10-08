import { isJSReservedWord } from './utils.js'

const binopMap = {
  add: '+',
  sub: '-',
  mul: '*',

  eq: '===',
  ne: '!==',

  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',

  'binary-ior': '|',
  'binary-and': '&',
}

const jsBinopToString = (op) => {
  if (!op.startsWith('binop/')) throw new Error(`not a binop: ${op}`)
  const mappedOp = binopMap[op.slice(6)]
  if (!mappedOp) throw new Error(`unknown binop: ${op}`)
  return mappedOp
}

const escapeIdentifier = (id) => (isJSReservedWord(id) ? '_' : '') + id.replace(/-/g, '_').replace(/\//g, '_slash_')

const jsExpToString = (js) => {
  if (!js) throw new Error('js exp is falsy')
  const { tag, args } = js
  switch (tag) {
    case 'js-exp/number':
      return args[0]
    case 'js-exp/string':
      return `'${args[0]}'`
    case 'js-exp/var':
      return escapeIdentifier(args[0])
    case 'js-exp/array':
      return `[${args[0].map(jsExpToString).join(', ')}]`
    case 'js-exp/subscript':
      return `${jsExpToString(args[0])}[${jsExpToString(args[1])}]`
    case 'js-exp/binop':
      return `(${jsExpToString(args[1])} ${jsBinopToString(args[0].tag)} ${jsExpToString(args[2])})`
    case 'js-exp/ternary':
      return `(${jsExpToString(args[0])} ? ${jsExpToString(args[1])} : ${jsExpToString(args[2])})`
    case 'js-exp/arrow-exp': {
      const [params, body] = args
      return `(${params.map(escapeIdentifier).join(', ')}) => ${jsExpToString(body)}`
    }
    case 'js-exp/arrow-stmt': {
      const [params, body] = args
      return `(${params.map(escapeIdentifier).join(', ')}) => ${jsStmtToString(body)}`
    }
    case 'js-exp/call':
      return `(${jsExpToString(args[0])})(${args[1].map(jsExpToString).join(', ')})`
    default:
      throw new Error(`unknown js exp tag: ${tag}`)
  }
}
const jsStmtToString = (js) => {
  if (!js) throw new Error('js stmt is falsy')
  const { tag, args } = js
  switch (tag) {
    case 'js-stmt/return':
      return `return ${jsExpToString(args[0])}`
    case 'js-stmt/if':
      return `if (${jsExpToString(args[0])}) ${jsStmtToString(args[1])} else ${jsStmtToString(args[2])}`
    case 'js-stmt/switch': {
      const [exp, cases, defaultCase] = args
      const jsCases = [
        ...cases.map(({ fst, snd }) => {
          const cases = fst.map((v) => `case ${jsExpToString(v)}:\n`).join('')
          return `${cases} ${jsStmtToString(snd)}`
        }),
        `default: ${jsStmtToString(defaultCase)}`,
      ].join('\n')
      return `switch (${jsExpToString(exp)}) {\n${jsCases}\n}`
    }
    case 'js-stmt/block':
      return `{\n${args[0].map(jsStmtToString).join(';\n')}\n}`
    case 'js-stmt/seq':
      return args[0].map(jsStmtToString).join(';\n')
    case 'js-stmt/const-decl':
      return `const ${escapeIdentifier(args[0])} = ${jsExpToString(args[1])}`
    case 'js-stmt/exp':
      return jsExpToString(args[0])

    default:
      throw new Error(`unknown js stmt tag: ${tag}`)
  }
}

import externs from './externs.js'

const runJsExp = (res) => {
  const jsSrc = jsExpToString(res)
  console.log('runJsExp src', jsSrc)
  const runFunc = new Function('externs', jsSrc)
  const value = runFunc(externs)
  console.log('runJsExp val', value)
  return value
}

const runJsStmt = (res) => {
  const jsSrc = jsStmtToString(res)
  console.log('runJsStmt src', jsSrc)
  const runFunc = new Function('externs', jsSrc)
  const value = runFunc(externs)
  console.log('runJsStmt val', value)
  return value
}

const callJsFunc = (func, args) => {
  if (typeof func !== 'function') {
    console.log('func', func)
    throw new Error('not a function')
  }
  const res = func(...args)
  console.log('callJsFunc', res)
  return res
}

import { makeDefEnv, evaluateFile, catchErrors } from './mini-lisp.js'
import { makeTaggedValue } from './core.js'

const defEnv = makeDefEnv('../wuns/', {
  js: { 'run-js-stmt': runJsStmt, 'run-js-exp': runJsExp, 'call-js-func': callJsFunc },
})

const wunsExports = evaluateFile(defEnv, 'compile-js.wuns')
const formToJs = wunsExports['compile-run']
// console.log({ jsStmt })
// const output = jsStmtToString(jsStmt)
const compileTopFormsDef = wunsExports['compile-top-forms']
const compileTopForms = (forms) => {
  return catchErrors(() => jsStmtToString(compileTopFormsDef(forms)))
}
export { formToJs, compileTopForms, jsStmtToString }
