import path from 'node:path'
import fs from 'node:fs'
import { print, wordValue, unword } from './core.js'
import { parseStringToForms } from './parseByHand.js'
import { defineImportFunction, parseEvalFile, getExported, apply, setFile } from './interpreter.js'

defineImportFunction('js-apply', (func, args) => func(...args))

defineImportFunction('make-macro-iife', (m) => {
  return makeContextIIFE(wordValue(m))
})

// defineImportFunction('wasm-module', (ar) => {
//   return new WebAssembly.Module(ar)
// })

// defineImportFunction('wasm-instance', (module) => {
//   return new WebAssembly.Instance(module, {})
// })

// defineImportFunction('wasm-import-func', (module) => {
//   return new WebAssembly.Instance(module, {})
// })

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const wunsDir = path.resolve(__dirname, '..', 'wuns')
const wunsFiles = fs.readdirSync(wunsDir)

for (const file of wunsFiles) {
  if (!file.endsWith('.wuns')) continue
  const bla = path.resolve(wunsDir, file)
  const content = fs.readFileSync(bla, 'utf8')
  setFile(file, content)
}
parseEvalFile('compiler-wasm.wuns')
const compileFormsContext = getExported('compiler-wasm.wuns', 'compile-top-forms-to-context')
const contextToModule = getExported('compiler-wasm.wuns', 'ctx-to-module')

const commandLineArgs = process.argv.slice(2)

if (commandLineArgs.length !== 1) throw new Error('missing input file')

const inputFilePath = commandLineArgs[0]
const inputFile = path.resolve(wunsDir, inputFilePath)
const content = fs.readFileSync(inputFile, 'utf8')
const forms = parseStringToForms(content)

// const compileForm = getGlobal('compile-top-form')
// for (const form of forms) apply(compileForm, [form])
const context = apply(compileFormsContext, [forms])
// console.dir(unword(context), { depth: null })
const moduleNumbers = apply(contextToModule, [context])
for (const n of moduleNumbers) {
  if ((n !== n) | 0) throw new Error('module number is not an integer: ' + n)
  if (n < 0 || n > 255) throw new Error('module number is out of range: ' + n)
}
// console.dir(moduleNumbers, { depth: null })
// for (let i = 0; i < moduleNumbers.length; i += 16) {
//   console.log(
//     moduleNumbers
//       .slice(i, i + 16)
//       .map((n) => n.toString(16).padStart(2, '0'))
//       .join(' '),
//   )
// }
const moduleBytes = new Uint8Array(moduleNumbers)
fs.writeFileSync('output.wasm', moduleBytes)
const wasmModule = new WebAssembly.Module(moduleBytes)
const wasmInstance = new WebAssembly.Instance(wasmModule, {})
// console.dir(wasmInstance.exports, { depth: null })
