import wabtProm from 'wabt'
import fs from 'fs'
const wabt = await wabtProm()

const mkParseWat = (s) => {
  // from: node_modules/wabt/index.js
  // Object.freeze({
  //   exceptions: false,
  //   mutable_globals: true,
  //   sat_float_to_int: true,
  //   sign_extension: true,
  //   simd: true,
  //   threads: false,
  //   function_references: false,
  //   multi_value: true,
  //   tail_call: false,
  //   bulk_memory: true,
  //   reference_types: true,
  //   annotations: false,
  //   code_metadata: false,
  //   gc: false,
  //   memory64: false,
  //   multi_memory: false,
  //   extended_const: false,
  //   relaxed_simd: false,
  // })
  try {
    const module = wabt.parseWat('', s, { multi_memory: true })
    module.resolveNames()
    module.validate()
    const { buffer } = module.toBinary({
      log: true,
      write_debug_names: true,
    })
    return buffer
  } catch (e) {
    fs.writeFileSync('tmp.wat', s)
    console.error(e)
    throw e
  }
}

import { makeInterpreterContext, apply } from './interpreter.js'

import { parseFile } from './parseTreeSitter.js'

const textDecoder = new TextDecoder()

const fileNames = ['std3', 'wasm-instructions', 'check', 'hosted', 'translate-test']
const files = fileNames.map((name) => parseFile(`../wuns/${name}.wuns`))

// const compile = getVarVal('compile')

// const forms = parseStringToForms(wunsSrc)

const context = makeInterpreterContext({ importObject: {} })
const { evalLogForms, getVarObject, defSetVar } = context
defSetVar('text-to-wasm', (allTextByteWords) => {
  const allText = textDecoder.decode(Uint8Array.from(allTextByteWords, (v) => +v))
  return mkParseWat(allText)
})
defSetVar('module-from-buffer', (buf) => {
  return new WebAssembly.Module(buf)
})
defSetVar('instantiate-module', (module, importObject) => {
  return new WebAssembly.Instance(module, importObject)
})
for (const file of files) evalLogForms(file)

const getVarVal = (name) => {
  const vo = getVarObject(name)
  if (!vo) throw new Error('getVarVal: ' + name)
  return vo.getValue()
}

const testMain = getVarVal('test-main')
apply(testMain)
// const allTextByteWords = apply(compToText, forms)
// const allText = textDecoder.decode(Uint8Array.from(allTextByteWords, (v) => +v))
// console.log({ allText })

// const buf = mkParseWat(allText)
// const module = new WebAssembly.Module(buf)
// const inst = new WebAssembly.Instance(module, { env: { mem: new WebAssembly.Memory({ initial: 1 }) } })
// const { exports } = inst
// const call = (name, args) => {
//   const f = exports[name]
//   if (!f) throw new Error('call: ' + name)
//   if (f.length !== args.length) throw new Error('call: ' + name + ' ' + args.length + ' ' + f.length)
//   return f(...args)
// }
// const res = call('f', args ? args : [])
