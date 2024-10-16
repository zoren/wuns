import { isJSReservedWord } from '../utils.js'
import { makeValueTagger } from '../core.js'

const binopMap = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  rem: '%',

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

const escapeIdentifier = (id) => {
  if (typeof id !== 'string') throw new Error('not a string')
  if (!isNaN(+id)) return ('n' + id).replace(/-/g, '_')
  return (isJSReservedWord(id) ? '_' : '') + id.replace(/-/g, '_').replace(/\//g, '_slash_').replace(/\./g, '_dot_')
}

const jsExpToString = (js) => {
  if (!js) throw new Error('js exp is falsy')
  const { tag, args } = js
  const arg = (i) => {
    if (!args[i]) throw new Error(`jsStmt ${tag} arg ${i} not found`)
    return args[i]
  }
  const paramsToString = () => {
    const allParams = arg(0).map(escapeIdentifier)
    const optRest = arg(1)
    if (optRest.tag === 'option/some') allParams.push(`...${escapeIdentifier(optRest.args[0])}`)
    return allParams.join(', ')
  }
  switch (tag) {
    case 'js-exp/number':
      return `${+arg(0)}`
    case 'js-exp/string':
      return `'${arg(0)}'`
    case 'js-exp/var':
      return escapeIdentifier(arg(0))
    case 'js-exp/array':
      return `[${arg(0).map(jsExpToString).join(', ')}]`
    case 'js-exp/object': {
      const entries = arg(0).map(({ fst, snd }) => `${fst}: ${jsExpToString(snd)}`)
      return `{${entries.join(', ')}}`
    }
    case 'js-exp/subscript':
      return `${jsExpToString(arg(0))}[${jsExpToString(args[1])}]`
    case 'js-exp/binop':
      return `(${jsExpToString(arg(1))} ${jsBinopToString(arg(0).tag)} ${jsExpToString(arg(2))})`
    case 'js-exp/ternary':
      return `(${jsExpToString(arg(0))} ? ${jsExpToString(arg(1))} : ${jsExpToString(arg(2))})`
    case 'js-exp/arrow-exp':
      return `(${paramsToString()}) => ${jsExpToString(arg(2))}`
    case 'js-exp/arrow-stmt':
      return `(${paramsToString()}) => ${jsStmtToString(arg(2))}`
    case 'js-exp/call':
      return `(${jsExpToString(arg(0))})(${arg(1).map(jsExpToString).join(', ')})`
    default:
      throw new Error(`unknown js exp tag: ${tag}`)
  }
}

const jsStmtToString = (js) => {
  if (!js) throw new Error('js stmt is falsy')
  const { tag, args } = js
  const arg = (i) => {
    if (!args[i]) throw new Error(`jsStmt ${tag} arg ${i} not found`)
    return args[i]
  }
  switch (tag) {
    case 'js-stmt/break':
      return 'break'
    case 'js-stmt/continue':
      return 'continue'
    case 'js-stmt/return':
      return `return ${jsExpToString(arg(0))}`
    case 'js-stmt/if':
      return `if (${jsExpToString(arg(0))}) ${jsStmtToString(arg(1))} else ${jsStmtToString(arg(2))}`
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
      return `{\n${arg(0).map(jsStmtToString).join(';\n')}\n}`
    case 'js-stmt/seq':
      return arg(0).map(jsStmtToString).join(';\n')
    case 'js-stmt/const-decl':
      return `const ${escapeIdentifier(arg(0))} = ${jsExpToString(arg(1))}`
    case 'js-stmt/assign':
      return `${escapeIdentifier(arg(0))} = ${jsExpToString(arg(1))}`
    case 'js-stmt/exp':
      return jsExpToString(arg(0))
    case 'js-stmt/throw':
      return `throw ${jsExpToString(arg(0))}`
    case 'js-stmt/while':
      return `while (${jsExpToString(arg(0))}) ${jsStmtToString(arg(1))}`
    case 'js-stmt/import':
      return `import ${arg(0)} from '${arg(1)}'`
    case 'js-stmt/export':
      return `export { ${arg(0).map(escapeIdentifier).join(', ')} }`

    default:
      throw new Error(`unknown js stmt tag: ${tag}`)
  }
}

const error = makeValueTagger('result/error', 1)
const ok = makeValueTagger('result/ok', 1)

const runJs = (jsSrc, externs) => {
  // console.log(jsSrc)
  try {
    const runFunc = new Function('externs', jsSrc)
    const before = performance.now()
    const r = runFunc(externs)
    const after = performance.now()
    // console.log('runJs time', after - before)
    return ok(r)
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof TypeError || e instanceof ReferenceError) {
      console.log('runJs error')
      console.log(e)
      console.log(jsSrc)
      // return error(`SyntaxError: ${e.message}`)
      // return error(e)
    }
    return error(e)
  }
}

export const run_js_stmt = (res, externs) => {
  const jsSrc = jsStmtToString(res)
  // console.log('runJsStmt src', jsSrc)
  return runJs(jsSrc, externs)
}

export const call_js_func = (func, args) => {
  if (typeof func !== 'function') {
    console.log('func', func)
    throw new Error('not a function')
  }
  const res = func(...args)
  console.log('callJsFunc', res)
  return res
}

import * as prettier from 'prettier'

const prettierOptions = {
  singleQuote: true,
  trailingComma: 'all',
  semi: false,
  printWidth: 120,
  parser: 'babel',
}

import fs from 'fs'

export const write_js_stmt = (file_name, stmt) => {
  const jsSrc = jsStmtToString(stmt)
  prettier.format(jsSrc, prettierOptions).then((formatted) => {
    fs.writeFileSync(file_name, formatted)
  })
}

export const identity = (v) => v
