import path from 'node:path'
import fs from 'node:fs'
import { print } from './core.js'
import { parseStringToForms } from './parse.js'
import { defineImportFunction, parseEvalFile, getGlobal, apply } from './interpreter.js'

const wunsWordToJSIdentifier = (word) => {
  const s = String(word)
  const n = Number(s)
  if (!isNaN(n)) return '_' + s
  return s.replace(/-/g, '_')
}

const jsDomToString = (dom) => {
  const [tag, ...children] = dom
  switch (tag) {
    case 'var':
      return wunsWordToJSIdentifier(children[0])
    case 'number':
      return children[0]
    case 'return':
      return `return ${jsDomToString(children[0])}`
    case 'stmts':
      return children.map(jsDomToString).join(';')
    case 'block':
      return `{ ${children.map(jsDomToString).join(';')} }`
    case 'const':
      return `const ${wunsWordToJSIdentifier(children[0])} = ${jsDomToString(children[1])}`
    case 'let':
      return `let ${wunsWordToJSIdentifier(children[0])} = ${jsDomToString(children[1])}`
    case 'assign':
      return `${jsDomToString(children[0])} = ${jsDomToString(children[1])}`
    case 'ternary':
      return `${jsDomToString(children[0])} ? ${jsDomToString(children[1])} : ${jsDomToString(children[2])}`
    case 'binop': {
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
      return `((${jsDomToString(children[1])} ${i32binops[children[0]]} ${jsDomToString(children[2])}) | 0)`
    }
    case 'call':
      return `${jsDomToString(children[0])}(${children.slice(1).map(jsDomToString).join(',')})`
    case 'field':
      return `${jsDomToString(children[0])}.${wunsWordToJSIdentifier(children[1])}`
    case 'if':
      return `if (${jsDomToString(children[0])}) ${jsDomToString(children[1])} else ${jsDomToString(children[2])}`
    case 'arrow-func':
      return `(${children[0].map(wunsWordToJSIdentifier).join(', ')}) => ${jsDomToString(children[1])}`
    case 'import':
      return `import { ${children.slice(1).map(wunsWordToJSIdentifier).join(', ')} } from '${children[0]}'`
    case 'while':
      return `while (${jsDomToString(children[0])}) ${jsDomToString(children[1])}`
    case 'continue':
      return 'continue'
  }
  console.dir({ dom }, { depth: null })
  throw new Error('unexpected dom tag: ' + tag)
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

defineImportFunction('js-apply', (func, args) => func(...args))
let jsSrc = ''

defineImportFunction('emit-js', (l) => {
  const src = jsDomToString(l)
  console.log('emitting: ' + src)
  jsSrc += src + '\n'
})

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const wunsDir = path.resolve(__dirname, '..', 'wuns')
parseEvalFile(path.resolve(wunsDir, 'compiler-js.wuns'))

const inputFile = path.resolve(wunsDir, 'input.wuns')
const content = fs.readFileSync(inputFile, 'utf8')
const forms = parseStringToForms(content)

try {
  const outfun = getGlobal('compile-forms')
  apply(outfun, [forms])
  console.log('done compiling: ' + forms.length)
} catch (e) {
  console.error('error evaluating compiler', e)
}

fs.writeFileSync('output.js', jsSrc)

import * as prettier from 'prettier'

fs.writeFileSync(
  'output.prettier.js',
  await prettier.format(jsSrc, {
    parser: 'babel',
    singleQuote: true,
    trailingComma: 'all',
    semi: false,
    printWidth: 120,
  }),
)
