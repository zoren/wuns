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
    console.log('allText', s)
    fs.writeFileSync('tmp.wat', s)
    console.error(e)
    throw e
  }
}

import { apply } from './core.js'
import { makeInterpreterContext } from './interpreter.js'

import { parseFile } from './parseTreeSitter.js'

const textDecoder = new TextDecoder()
const wordBytesToString = (wordBytes) => textDecoder.decode(Uint8Array.from(wordBytes, (v) => +v))
const { evalLogForms, getVarVal, defSetVar } = makeInterpreterContext()
const textToWasm = (allTextByteWords) => {
  const llText = wordBytesToString(allTextByteWords)
  fs.writeFileSync('ll.wat', llText)
  return mkParseWat(llText)
}
defSetVar('text-to-wasm', textToWasm)
defSetVar('module-from-buffer', (buf) => new WebAssembly.Module(buf))
defSetVar('instantiate-module', (module, importObject) => new WebAssembly.Instance(module, importObject))
defSetVar('wasm-memory', (paramObj) => new WebAssembly.Memory(paramObj))
defSetVar('byte-array', (buffer, byteOffset, length) => new Uint8Array(buffer, byteOffset, length))
for (const name of ['std3', 'wasm-instructions', 'check', 'hosted', 'translate-test'])
  evalLogForms(parseFile(`../wuns/${name}.wuns`))

apply(getVarVal('test-main'))

apply(getVarVal('test-file'), parseFile(`../wuns/ll.wuns`))
