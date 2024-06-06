import path from 'node:path'
import fs from 'node:fs'

import { print } from './core.js'
import { parseStringToForms } from './parseByHand.js'
import { makeContext } from './interpreter.js'

const compilerContext = makeContext()
const { defineImportFunction, parseEvalFile, getExported, apply } = compilerContext

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const wunsDir = path.resolve(__dirname, '..', 'wuns')

const wunsFileContent = []

for (const file of fs.readdirSync(wunsDir)) {
  if (!file.endsWith('.wuns')) continue
  wunsFileContent.push([file, fs.readFileSync(path.resolve(wunsDir, file), 'ascii')])
}

const setFiles = ({ setFile }) => {
  for (const [file, content] of wunsFileContent) setFile(file, content)
}

defineImportFunction('make-interpreter-context', (name) => {
  const ctx = makeContext()
  const prefix = name + ':'
  ctx.defineImportFunction('log', (form) => {
    console.log(prefix, print(form))
  })
  setFiles(ctx)
  return ctx
})

defineImportFunction('context-eval', (context, form) => {
  const { evalFormCurrentModule } = context
  return evalFormCurrentModule(form)
})
defineImportFunction('log', (form) => {
  console.log('complog:', print(form))
})
setFiles(compilerContext)
parseEvalFile('compiler-wasm.wuns')
const compileFormsContext = getExported('compiler-wasm.wuns', 'compile-top-forms-to-context')
const contextToModule = getExported('compiler-wasm.wuns', 'ctx-to-module')

const commandLineArgs = process.argv.slice(2)

if (commandLineArgs.length !== 1) throw new Error('missing input file')

const inputFilePath = commandLineArgs[0]
const inputFile = path.resolve(wunsDir, inputFilePath)
const content = fs.readFileSync(inputFile, 'ascii')
const forms = parseStringToForms(content)
const context = apply(compileFormsContext, [forms])
// import { unword } from './core.js'
// console.dir(unword(context), { depth: null })
const moduleNumbers = apply(contextToModule, [context])
// console.dir(moduleNumbers, { depth: null })
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
