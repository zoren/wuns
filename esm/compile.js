import path from 'node:path'
import fs from 'node:fs'
import { print, wordValue, unword } from './core.js'
import { parseStringToForms } from './parse.js'
import { defineImportFunction, parseEvalFile, getGlobal, apply } from './interpreter.js'

const wunsWordToJSIdentifier = (word) => {
  const s = String(word)
  const n = Number(s)
  if (!isNaN(n)) return '_' + s
  return s.replace(/-/g, '_')
}

const i32binops = {
  add: '+',
  sub: '-',
  mul: '*',
  'div-signed': '/',
  'rem-signed': '%',

  eq: '===',
  ne: '!==',

  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',

  'bitwise-and': '&',
  'bitwise-ior': '|',
  'bitwise-xor': '^',
  'bitwise-shift-left': '<<',
  'bitwise-shift-right-signed': '>>',
  'bitwise-shift-right-unsigned': '>>>',
}

const commasepWords = (words) => words.map(wunsWordToJSIdentifier).join(', ')

const jsDomToString = (dom) => {
  const go = (dom) => {
    if (!Array.isArray(dom)) {
      console.dir({ dom }, { depth: null })
      throw new Error('expected dom to be an array')
    }
    const [tag, ...args] = dom
    switch (tag) {
      case 'var':
        return wunsWordToJSIdentifier(args[0])
      case 'number':
        return args[0]
      case 'string':
        return `'${args[0]}'`
      case 'return':
        return `return ${go(args[0])}`
      case 'stmts':
        return args.map(go).join(';')
      case 'array':
        return `[${args.map(go).join(',')}]`
      case 'block':
        return `{ ${args.map(go).join(';')} }`
      case 'const':
        return `const ${wunsWordToJSIdentifier(args[0])} = ${go(args[1])}`
      case 'let':
        return `let ${wunsWordToJSIdentifier(args[0])} = ${go(args[1])}`
      case 'assign':
        return `${go(args[0])} = ${go(args[1])}`
      case 'ternary':
        return `${go(args[0])} ? ${go(args[1])} : ${go(args[2])}`
      case 'binop':
        return `((${go(args[1])} ${i32binops[args[0]]} ${go(args[2])}) | 0)`
      case 'call': {
        if (args.length === 0) throw new Error('call expects at least one arg')
        const [f, ...fargs] = args
        return `${go(f)}(${fargs.map(go).join(',')})`
      }
      case 'field':
        return `${go(args[0])}.${wunsWordToJSIdentifier(args[1])}`
      case 'if':
        return `if (${go(args[0])}) ${go(args[1])} else ${go(args[2])}`
      case 'arrow-func':
        return `((${commasepWords(args[0])}) => ${go(args[1])})`
      case 'import':
        return `import { ${commasepWords(args.slice(1))} } from '${args[0]}'`
      case 'dynamic-import':
        return `const { ${commasepWords(args.slice(1))} } = await import('${args[0]}')`
      case 'while':
        return `while (${go(args[0])}) ${go(args[1])}`
      case 'continue':
        return 'continue'
      case 'export':
        return `export { ${commasepWords(args)} }`
    }
    throw new Error('unexpected dom tag: ' + tag)
  }
  try {
    return go(dom)
  } catch (e) {
    console.dir(unword(dom), { depth: null })
    console.error('jsDomToString error', e)
    throw e
  }
}

defineImportFunction('form-to-func', (params, body) => {
  const src = jsDomToString(body)
  try {
    return new Function(...params.map(wunsWordToJSIdentifier), src)
  } catch (e) {
    console.error('form-to-func error', e, src)
    console.dir({ params: print(params), body }, { depth: null })
  }
})

defineImportFunction('form-to-async-func', (params, body) => {
  const src = jsDomToString(body)
  try {
    return new AsyncFunction(...params.map(wunsWordToJSIdentifier), src)
  } catch (e) {
    console.error('form-to-async-func error', e, src)
    console.dir({ params: print(params), body }, { depth: null })
  }
})

defineImportFunction('js-apply', (func, args) => func(...args))
let emittedJS = ''

defineImportFunction('emit-js', (l) => {
  const src = jsDomToString(l)
  console.log('emitting: ' + src)
  emittedJS += src + '\n'
})

import * as esbuild from 'esbuild'

const esmJSToIIFE = (contents, globalName, footerJS) => {
  try {
    const result = esbuild.buildSync({
      stdin: {
        contents,
        resolveDir: './',
      },
      bundle: true,
      write: false,
      format: 'iife',
      globalName,
      footer: { js: footerJS },
    })
    const { outputFiles } = result
    const [output] = outputFiles
    const src = output.text
    return src
  } catch (e) {
    console.error('esmJSToIIFE error', { contents, globalName, footerJS }, e)
  }
}
const makeContextIIFE = (m) => {
  const wm = wunsWordToJSIdentifier(m)
  const src = emittedJS + '\n' + `export { ${wm} }`
  const globalName = '_wunsContext'
  const footerJS = `return _wunsContext.${wm}`
  const iifeSrc = esmJSToIIFE(src, globalName, footerJS)
  console.log('iifeSrc', iifeSrc)
  const f = Function(iifeSrc)()
  console.log('makeContextIIFE f', f)
  return f
  // return iifeSrc
}

defineImportFunction('make-macro-iife', (m) => {
  return makeContextIIFE(wordValue(m))
})
const __dirname = path.dirname(new URL(import.meta.url).pathname)
const wunsDir = path.resolve(__dirname, '..', 'wuns')
parseEvalFile(path.resolve(wunsDir, 'compiler-js.wuns'))

const inputFile = path.resolve(wunsDir, 'input.wuns')
const content = fs.readFileSync(inputFile, 'utf8')
const forms = parseStringToForms(content)

const compileForm = getGlobal('compile-top-form')
for (const form of forms) apply(compileForm, [form])

// try {
//   const outfun = getGlobal('compile-forms')
//   apply(outfun, [forms])
//   console.log('done compiling: ' + forms.length)
// } catch (e) {
//   console.error('error evaluating compiler', e)
// }

fs.writeFileSync('output.js', emittedJS)

import * as prettier from 'prettier'

fs.writeFileSync(
  'output.prettier.js',
  await prettier.format(emittedJS, {
    parser: 'babel',
    singleQuote: true,
    trailingComma: 'all',
    semi: false,
    printWidth: 120,
  }),
)
