import { isJSReservedWord } from './utils.js'

const jsBinopToString = (op) => {
  switch (op) {
    case 'binop/add':
      return '+'
    case 'binop/sub':
      return '-'
    case 'binop/mul':
      return '*'
    case 'binop/binary-ior':
      return '|'
    default:
      throw new Error(`unknown op: ${op}`)
  }
}

const escapeIdentifier = (id) => (isJSReservedWord(id) ? '_' : '') + id.replace(/-/g, '_')

const jsExpToString = (js) => {
  const { tag, args } = js
  switch (tag) {
    case 'js-exp/number':
      return args[0]
    case 'js-exp/string':
      return `'${args[0]}'`
    case 'js-exp/var':
      return escapeIdentifier(args[0])
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
  const { tag, args } = js
  switch (tag) {
    case 'js-stmt/return':
      return `return ${jsExpToString(args[0])}`
    case 'js-stmt/if':
      return `if (${jsExpToString(args[0])}) ${jsStmtToString(args[1])} else ${jsStmtToString(args[2])}`
    case 'js-stmt/switch': {
      const [exp, cases, defaultCase] = args
      const jsCases = [
        ...cases.map((jsc) => `case ${jsExpToString(jsc.fst)}: ${jsStmtToString(jsc.snd)}`),
        `default: ${jsStmtToString(defaultCase)}`,
      ].join('\n')
      return `switch (${jsExpToString(exp)}) {\n${jsCases}\n}`
    }
    case 'js-stmt/block':
      return `{\n${args[0].map(jsStmtToString).join('\n')}\n}`
    case 'js-stmt/seq':
      return args[0].map(jsStmtToString).join('\n')
    case 'js-stmt/const-decl':
      return `const ${escapeIdentifier(args[0])} = ${jsExpToString(args[1])}`

    default:
      throw new Error(`unknown js stmt tag: ${tag}`)
  }
}

const runJsStmt = (res) => {
  const jsSrc = jsStmtToString(res)
  const runFunc = new Function(jsSrc)
  return runFunc()
}

import { makeDefEnv, evaluateFile } from './mini-lisp.js'

const defEnv = makeDefEnv('../wuns/', { js: { 'run-js-stmt': runJsStmt } })

const wunsExports = evaluateFile(defEnv, 'compile-js.wuns')
const formToJs = wunsExports['compile-run']
const compileTopForms = wunsExports['compile-top-forms']
export { formToJs, compileTopForms, jsStmtToString }
