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
  'binary-xor': '^',
  'binary-and': '&',

  'binary-shl': '<<',
  'binary-shr': '>>',
  'binary-shr-u': '>>>',
}

const jsBinopToString = (op) => {
  if (!op.startsWith('binop/')) throw new Error(`not a binop: ${op}`)
  const mappedOp = binopMap[op.slice(6)]
  if (!mappedOp) throw new Error(`unknown binop: ${op}`)
  return mappedOp
}

const isJSReservedWord = (word) => {
  return [
    'abstract',
    'await',
    'boolean',
    'break',
    'byte',
    'case',
    'catch',
    'char',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'double',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'final',
    'finally',
    'float',
    'for',
    'function',
    'goto',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'int',
    'interface',
    'let',
    'long',
    'native',
    'new',
    'null',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'short',
    'static',
    'super',
    'switch',
    'synchronized',
    'this',
    'throw',
    'throws',
    'transient',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'volatile',
    'while',
    'with',
    'yield',
  ].includes(word)
}

export const escapeIdentifier = (id) => {
  if (typeof id !== 'string') throw new Error('not a string')
  if (!isNaN(+id)) return ('n' + id).replace(/-/g, '_')
  return (isJSReservedWord(id) ? '_' : '') + id.replace(/-/g, '_').replace(/\//g, '_slash_').replace(/\./g, '_dot_')
}

export const jsExpToString = (js) => {
  if (!js) throw new Error('js exp is falsy')
  const { tag, args } = js
  const arg = (i) => {
    if (i >= args.length) throw new Error(`jsExpToString ${tag} arg ${i} not found`)
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
      const entries = arg(0).map(({ fst, snd }) => `'${fst}': ${jsExpToString(snd)}`)
      return `{${entries.join(', ')}}`
    }
    case 'js-exp/subscript':
      return `${jsExpToString(arg(0))}[${jsExpToString(args[1])}]`
    case 'js-exp/binop-direct':
      return `(${jsExpToString(arg(1))} ${arg(0)} ${jsExpToString(arg(2))})`
    case 'js-exp/binop':
      return `(${jsExpToString(arg(1))} ${jsBinopToString(arg(0).tag)} ${jsExpToString(arg(2))})`
    case 'js-exp/ternary':
      return `(${jsExpToString(arg(0))} ? ${jsExpToString(arg(1))} : ${jsExpToString(arg(2))})`
    case 'js-exp/arrow-exp':
      return `(${paramsToString()}) => (${jsExpToString(arg(2))})`
    case 'js-exp/arrow-stmt':
      return `(${paramsToString()}) => ${jsStmtToString(arg(2))}`
    case 'js-exp/call':
      return `(${jsExpToString(arg(0))})(${arg(1).map(jsExpToString).join(', ')})`
    case 'js-exp/paren':
      return `(${jsExpToString(arg(0))})`
    case 'js-exp/await':
      return `await ${jsExpToString(arg(0))}`
    case 'js-exp/new':
      return `new ${jsExpToString(arg(0))}`
    case 'js-exp/assign-exp':
      return `${jsExpToString(arg(0))} = ${jsExpToString(arg(1))}`
    case 'js-exp/paren-comma':
      return `( ${arg(0).map(jsExpToString).join(', ')} )`

    default:
      throw new Error(`unknown js exp tag: ${tag}`)
  }
}

export const jsStmtToString = (js) => {
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
    case 'js-stmt/let-decl':
      return `let ${escapeIdentifier(arg(0))} = ${jsExpToString(arg(1))}`
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
    case 'js-stmt/import-as-string': {
      const imports = arg(0).map(({ fst, snd }) => `'${fst}' as ${escapeIdentifier(snd)}`)
      return `import { ${imports} } from '${arg(1)}'`
    }
    case 'js-stmt/export':
      // export { name1, /* …, */ nameN };
      return `export { ${arg(0).map(escapeIdentifier).join(', ')} }`
    case 'js-stmt/export-as-string': {
      // export { variable1 as "string name" };
      const exports = arg(0).map(({ fst, snd }) => `${escapeIdentifier(fst)} as '${snd}'`)
      return `export { ${exports.join(', ')} }`
    }

    default:
      throw new Error(`unknown js stmt tag: ${tag}`)
  }
}

export { jsStmtToString as 'js-stmt-to-string' }

// const runJs = (jsSrc, externs) => {
//   // console.log(jsSrc)
//   try {
//     const runFunc = new Function('externs', jsSrc)
//     const before = performance.now()
//     const r = runFunc(externs)
//     const after = performance.now()
//     // console.log('runJs time', after - before)
//     return resultOk(r)
//   } catch (e) {
//     if (e instanceof SyntaxError || e instanceof TypeError || e instanceof ReferenceError) {
//       console.log('runJs error')
//       console.log(e)
//       console.log(jsSrc)
//       // return error(`SyntaxError: ${e.message}`)
//       // return error(e)
//     }
//     return resultError(e)
//   }
// }

// const run_js_stmt = (res, externs) => {
//   const jsSrc = jsStmtToString(res)
//   // console.log('runJsStmt src', jsSrc)
//   return runJs(jsSrc, externs)
// }

// export { run_js_stmt as 'run-js-stmt' }

import * as prettier from 'prettier'

const prettierOptions = {
  singleQuote: true,
  trailingComma: 'all',
  semi: false,
  printWidth: 120,
  parser: 'babel',
}

export const format_js_src_async = (jsSrc) => prettier.format(jsSrc, prettierOptions)

export { format_js_src_async as 'format-js-src-async' }

// import fs from 'node:fs'

// const write_js_stmt = (file_name, stmt) => {
//   const jsSrc = jsStmtToString(stmt)
//   fs.writeFileSync(file_name + '.orig.js', jsSrc)
//   prettier.format(jsSrc, prettierOptions).then((formatted) => {
//     fs.writeFileSync(file_name + '.formatted.js', formatted)
//   })
// }

// export { write_js_stmt as 'write-js-stmt' }

export const identity = (v) => v
const to_js_value = (v) => v
export { to_js_value as 'to-js-value' }
const is_undefined = (v) => +(v === undefined)
export { is_undefined as 'is-undefined' }
// [def-js-extern js-value-is-array [func [js-value] i32]]
const js_value_is_array = (v) => Array.isArray(v)
export { js_value_is_array as 'js-value-is-array' }
// [def-js-extern js-value-to-array [func [js-value] [list js-value]]]
const js_value_to_array = (v) => {
  if (!Array.isArray(v)) throw new Error('expects array')
  return v
}
export { js_value_to_array as 'js-value-to-array' }
const object_to_kv_map = (obj) => {
  if (typeof obj !== 'object') throw new Error('expects object')
  return new Map(Object.entries(obj))
}
export { object_to_kv_map as 'object-to-kv-map' }

const kv_map_to_object = (map) => {
  if (!(map instanceof Map)) throw new Error('expects map')
  for (const [k] of map) if (typeof k !== 'string') throw new Error('expects string keys')
  return Object.fromEntries(map)
}
export { kv_map_to_object as 'kv-map-to-object' }

const byte_array_from = (v) => new Uint8Array(v)
export { byte_array_from as 'byte-array-from' }
const object_get = (obj, key) => {
  if (typeof obj !== 'object') throw new Error('expects object')
  return obj[key]
}
export { object_get as 'object-get' }
const performance_now = () => performance.now()
export { performance_now as 'performance-now' }
const console_log = (...v) => console.log(...v)
export { console_log as 'console-log' }

const promise_resolve = (v) => Promise.resolve(v)
export { promise_resolve as 'promise-resolve' }

const promise_bind = (p, f) => p.then(f)
export { promise_bind as 'promise-bind' }

const promise_then = (p, f) => p.then(f)
export { promise_then as 'promise-then' }

const promises_seq = (l, f) => {
  let p = Promise.resolve()
  const results = []
  for (const x of l) p = p.then(() => f(x)).then((r) => results.push(r))
  return p.then(() => results)
}
export { promises_seq as 'promises-seq' }

const promise_all = (l) => Promise.all(l)
export { promise_all as 'promise-all' }

const js_apply = (f, args) => f(...args)
export { js_apply as 'js-apply' }

const js_apply_error = (f, args) => {
  try {
    f(...args)
  } catch (e) {
    return e
  }
  throw new Error('js-apply-error: no error')
}
export { js_apply_error as 'js-apply-error' }
