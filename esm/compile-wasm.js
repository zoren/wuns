import path from 'node:path'
import fs from 'node:fs'

import { parseStringToForms } from './parseTreeSitter.js'
import { makeContext } from './interpreter.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const wunsDir = path.resolve(__dirname, '..', 'wuns') + '/'

const compilerContext = makeContext({ wunsDir, contextName: 'compiler-wasm' })
const { parseEvalFile, getExported, apply } = compilerContext

parseEvalFile('compiler-wasm.wuns')
const compileFormsModule = getExported('compiler-wasm.wuns', 'compile-top-forms-to-module')

const commandLineArgs = process.argv.slice(2)

if (commandLineArgs.length !== 1) throw new Error('missing input file')

const inputFilePath = commandLineArgs[0]
const inputFile = path.resolve(wunsDir, inputFilePath)
const content = fs.readFileSync(inputFile, 'ascii')
const forms = parseStringToForms(content)
const moduleNumbers = apply(compileFormsModule, [forms])
for (const n of moduleNumbers) {
  if (n !== (n | 0)) throw new Error('module number is not an integer: ' + n)
  if (n < 0 || n > 255) throw new Error('module number is out of range: ' + n)
}
// console.log('---')
const hexDump = (moduleBytes) => {
  for (let i = 0; i < moduleBytes.length; i += 16) {
    console.log([...moduleBytes.slice(i, i + 16)].map((n) => n.toString(16).padStart(2, '0')).join(' '))
  }
}
// hexDump(moduleNumbers)
const moduleBytes = new Uint8Array(moduleNumbers)
// console.log('---')
hexDump(moduleBytes)

const inputFileName = path.basename(inputFilePath)
const outputFilePath = inputFileName.replace(/\.wuns$/, '.wasm')
fs.writeFileSync(outputFilePath, moduleBytes)
const module = new WebAssembly.Module(moduleBytes)
const imports = WebAssembly.Module.imports(module)
const exports = WebAssembly.Module.exports(module)

console.log({ imports, exports })
