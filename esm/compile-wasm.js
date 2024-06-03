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
  console.log({ file })
  setFile(file, content)
}
parseEvalFile('compiler-wasm.wuns')
const compileForms = getExported('compiler-wasm.wuns', 'compile-top-forms')

const commandLineArgs = process.argv.slice(2)

if (commandLineArgs.length !== 1) throw new Error('missing input file')

const inputFilePath = commandLineArgs[0]
const inputFile = path.resolve(wunsDir, inputFilePath)
const content = fs.readFileSync(inputFile, 'utf8')
const forms = parseStringToForms(content)

// const compileForm = getGlobal('compile-top-form')
// for (const form of forms) apply(compileForm, [form])
const moduleNumbers = apply(compileForms, [forms])
console.dir(moduleNumbers, { depth: null })
const moduleBytes = new Uint8Array(moduleNumbers)
const module = new WebAssembly.Module(moduleBytes)
const instance = new WebAssembly.Instance(module, {})
console.dir(instance.exports, { depth: null })
// console.dir(unword(exportInterface), { depth: null })
// const eiString = print(exportInterface)
// console.log(eiString)
// try {
//   const outfun = getGlobal('compile-forms')
//   apply(outfun, [forms])
//   console.log('done compiling: ' + forms.length)
// } catch (e) {
//   console.error('error evaluating compiler', e)
// }

fs.writeFileSync('output.wasm', moduleBytes)
