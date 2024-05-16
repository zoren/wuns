const { wordString, isWord, print } = require('./core')
const { mkFuncEnv } = require('./std.js')
const { evalTreeEvaluator, treeToOurForm, makeEvaluator } = require('./interpreter.js')

const parseParams = (paramOr) => {
  const params = paramOr[0]
  let restParam = null
  if (paramOr.length === 2) {
    restParam = paramOr[1]
  }
  const paramStrings = params.map(wunsWordToJSId)
  if (restParam) {
    paramStrings.push('... ' + wunsWordToJSId(restParam))
  }
  return paramStrings
}

const jsInstructions = {
  '===': '===',
  add: '+',
  sub: '-',
  mul: '*',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',
  eq: '===',
  'bitwise-and': '&',
}
const wunsWordToJSId = (w) => {
  if (!isWord(w)) throw new Error('expected word')
  const s = wordString(w)
  if (!/^[a-z0-9.=-]+$/.test(s)) throw new Error('invalid identifier: ' + s)
  return s.replace(/-/g, '_').replace(/=/g, 'EQ').replace(/\./g, 'DOT')
}
const jsDOMToJS = (f) => {
  if (isWord(f)) return wordString(f)
  if (!Array.isArray(f)) throw new Error('expected word or list')
  if (f.length === 0) return `[]`
  const [first, ...rest] = f
  if (!isWord(first)) {
    console.error({ first })
    throw new Error('expected word')
  }
  const s = wordString(first)
  switch (s) {
    case 'value':
      return `${wordString(rest[0])} | 0`
    case 'var':
      return wunsWordToJSId(rest[0])
    case 'continue':
      return 'continue'
    case 'op': {
      const [name, ...args] = rest
      if (!isWord(name)) throw new Error('expected word')
      const n = wordString(name)
      const instr = jsInstructions[n]
      if (!instr) throw new Error('unknown instruction: ' + n)
      if (args.length !== 2) throw new Error('expected 2 arguments')
      return `((${jsDOMToJS(args[0])}) ${instr} (${jsDOMToJS(args[1])})) | 0`
    }
    case 'call': {
      const [f, ...args] = rest
      if (!isWord(f)) return `(${jsDOMToJS(f)})(${args.map(jsDOMToJS).join(', ')})`
      return `${wunsWordToJSId(f)}(${args.map(jsDOMToJS).join(', ')})`
    }
    case 'string':
      return `'${wordString(rest[0])}'`
    case 'array':
      return `[${rest.map(jsDOMToJS).join(', ')}]`
    case 'ternary':
      return `(${jsDOMToJS(rest[0])}) ? (${jsDOMToJS(rest[1])}) : (${jsDOMToJS(rest[2])})`
    case 'if':
      return `if (${jsDOMToJS(rest[0])}) ${jsDOMToJS(rest[1])} else ${jsDOMToJS(rest[2])}`
    case 'block':
      return `{ ${rest.map(jsDOMToJS).join('; ')} }`
    case 'const':
      return `const ${wunsWordToJSId(rest[0])} = ${jsDOMToJS(rest[1])}`
    case 'let':
      return `let ${wunsWordToJSId(rest[0])} = ${jsDOMToJS(rest[1])}`
    case 'assign':
      return `${wunsWordToJSId(rest[0])} = ${jsDOMToJS(rest[1])}`
    case 'return':
      return `return ${jsDOMToJS(rest[0])}`
    case 'loop':
      return `while(1) { ${rest.map(jsDOMToJS).join(';')} }`
    case 'arrow-func': {
      const [paramOr, body] = rest
      const params = parseParams(paramOr)
      return `(${params.join(', ')}) => { ${body.map(jsDOMToJS).join(';')} }`
    }
    case 'import': {
      const [file, ...imports] = rest
      return `const { ${imports.map(wunsWordToJSId).join(', ')} } = require('./${wordString(file)}')`
    }
    case 'export': {
      return `module.exports = { ${rest.map(wunsWordToJSId).join(', ')} }`
    }
  }
  throw new Error('unexpected: ' + s)
}

const args = process.argv.slice(2)
const fs = require('fs')
const path = require('path')
const content = fs.readFileSync('wuns/compiler-js.wuns', 'utf8')
const TSParser = require('tree-sitter')
const parser = new TSParser()

const Wuns = require('tree-sitter-wuns')
parser.setLanguage(Wuns)

const compilerTree = parser.parse(content)
const wasmModule = new WebAssembly.Module(fs.readFileSync(path.resolve(__dirname, 'instructions.wasm')))
const wasmInstance = new WebAssembly.Instance(wasmModule)
const instructions = wasmInstance.exports

const importObject = {
  log: (s) => {
    console.log(s)
  },
}
const funcEnv = mkFuncEnv(importObject, instructions)
funcEnv.set('form-to-func', (paramOr, bodies) => {
  // const paramStrings = params.map(wunsWordToJSId)
  const paramStrings = parseParams(paramOr)

  const js = bodies.map(jsDOMToJS).join(';')

  try {
    return new Function(...paramStrings, js)
  } catch (e) {
    console.log(js)
    throw e
  }
})
funcEnv.set('js-apply', (f, args) => {
  if (typeof f !== 'function') {
    console.log({ f })
    throw new Error('expected function for f ' + typeof f)
  }
  if (!Array.isArray(args)) throw new Error('expected array')
  return f(...args)
})
const evaluator = makeEvaluator(funcEnv)
evalTreeEvaluator(compilerTree, evaluator)
const { getExport, apply } = evaluator
const compileFormTop = getExport('compile-form-top')

const root = parser.parse(fs.readFileSync(args[0], 'utf8')).rootNode
let output = []
for (const child of root.children) {
  const form = treeToOurForm(child)
  console.log(print(form))
  const jsDom = apply(compileFormTop, [form])
  output.push(jsDOMToJS(jsDom))
}
console.log(output.join('\n'))
fs.writeFileSync('src/out.js', output.join('\n'))
