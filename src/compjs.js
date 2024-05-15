const { jsDOMToJS } = require('./std.js')
const { evalTree, treeToOurForm } = require('./interpreter.js')
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
