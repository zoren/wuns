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
    fs.writeFileSync('self-host.wasm', buffer)
    return buffer
  } catch (e) {
    console.log('allText', s)
    fs.writeFileSync('tmp.wat', s)
    console.error(e)
    throw e
  }
}
const textDecoder = new TextDecoder()

import { makeInitInterpreter, parseEvalFile, hostExports } from './interpreter.js'
if (false) {
  const selfHostModule = new WebAssembly.Module(fs.readFileSync('self-host.wasm'))
  // [defn log-pointer [x y]
  //   [log-byte-array [byte-array [object-get [atom-get mem-atom] [quote buffer]] x y]]]
  const mkEnv = () => {
    const mem = new WebAssembly.Memory({ initial: 1 })
    const logPointer = (x, y) => {
      const bytes = new Uint8Array(mem.buffer, x, y)
      console.log(textDecoder.decode(bytes))
    }
    const logI32 = (x) => console.log(x)
    return { env: { mem, 'log-pointer': logPointer, 'log-i32': logI32 } }
  }
  const selfHostInstance = new WebAssembly.Instance(selfHostModule, mkEnv())
  const selfHostExports = selfHostInstance.exports
  console.log({ selfHostExports })
  console.log(Object.keys(hostExports))
  for (const [k, v] of hostExports) {
    if (typeof k === 'string' && !(k in selfHostExports)) {
      console.log('missing', k)
    }
  }
}
import { parseFile } from './parseTreeSitter.js'

const wordBytesToString = (wordBytes) => textDecoder.decode(Uint8Array.from(wordBytes, (v) => +v))
const ctx = makeInitInterpreter()
const { getVarVal, defSetVar } = ctx
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
defSetVar('log-byte-array', (bytes) => {
  console.log(textDecoder.decode(bytes))
})
for (const name of ['std3', 'wasm-instructions', 'check', 'hosted', 'translate-test'])
  parseEvalFile(ctx, (`../wuns/${name}.wuns`))

getVarVal('test-main')()

getVarVal('test-file')(parseFile(`../wuns/self-host.wuns`))
