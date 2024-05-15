const { evalTree, treeToOurForm } = require('./interpreter.js')
const { wordString, isWord } = require('./core')

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
const jsDOMToJS = (l) => {
  if (isWord(l)) return wordString(l)
  if (!Array.isArray(l)) throw new Error('expected word or list')
  if (l.length === 0) return []
  const [first, ...rest] = l
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
      const [params, body] = rest
      return `(${params.map(wunsWordToJSId).join(', ')}) => { ${body.map(jsDOMToJS).join(';')} }`
    }
    case 'arrow-func-rest': {
      const [params, restParam, body] = rest
      const outParams = [...params.map(wunsWordToJSId), `... ${wunsWordToJSId(restParam)}`]
      return `(${outParams.join(', ')}) => { ${body.map(jsDOMToJS).join(';')} }`
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
const { getExport, apply } = evalTree(compilerTree, { importObject, instructions })
const compileFormTop = getExport('compile-form-top')

const root = parser.parse(fs.readFileSync(args[0], 'utf8')).rootNode
let output = []
for (const child of root.children) {
  const jsDom = apply(compileFormTop, [treeToOurForm(child)])
  output.push(jsDOMToJS(jsDom))
}
console.log(output.join('\n'))
fs.writeFileSync('src/out.js', output.join('\n'))
