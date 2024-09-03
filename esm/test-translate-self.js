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

import { hostFuncTypes, makeInitContext, parseEvalFiles } from './interpreter.js'
if (false) {
  const selfHostModule = new WebAssembly.Module(fs.readFileSync('self-host.wasm'))
  const mkEnv = () => {
    const mem = new WebAssembly.Memory({ initial: 1 })
    const logPointer = (offset, length) => {
      console.log(textDecoder.decode(new Uint8Array(mem.buffer, offset, length)))
    }
    const logI32 = (x) => console.log(x)
    return { env: { mem, 'log-pointer': logPointer, 'log-i32': logI32 } }
  }
  const selfHostInstance = new WebAssembly.Instance(selfHostModule, mkEnv())
  const selfHostExports = selfHostInstance.exports
  for (const [k, v] of hostExports) {
    if (typeof v !== 'function') {
      console.log('not a function', v)
    }
    const selfHostVal = selfHostExports[k]
    if (!selfHostVal) {
      console.log('missing', k)
      continue
    }
    if (typeof selfHostVal !== 'function') {
      console.log('not a function', k)
    }
    if (selfHostVal.length !== v.length) {
      console.log('length mismatch', k, selfHostVal.length, v.length)
    }
  }
}
import { parseFile } from './parseTreeSitter.js'
const wordBytesToString = (wordBytes) => textDecoder.decode(Uint8Array.from(wordBytes, (v) => +v))
const ctx = makeInitContext()
const { compile, defVars } = ctx
const textToWasm = (allTextByteWords) => {
  const llText = wordBytesToString(allTextByteWords)
  fs.writeFileSync('ll.wat', llText)
  return mkParseWat(llText)
}
// const insertFunc = (name, f) => {
//   defVars.set(name, defVarWithMeta(name, f, { 'n-of-params': f.length }))
// }
insertFunc('text-to-wasm', textToWasm)
insertFunc('module-from-buffer', (buf) => new WebAssembly.Module(buf))
insertFunc('instantiate-module', (module, importObject) => new WebAssembly.Instance(module, importObject))
insertFunc('wasm-memory', (paramObj) => new WebAssembly.Memory(paramObj))
insertFunc('byte-array', (buffer, byteOffset, length) => new Uint8Array(buffer, byteOffset, length))
insertFunc('log-byte-array', (bytes) => {
  console.log(textDecoder.decode(bytes))
})
import { isWord, isList, wordValue, makeList, word, print } from './core.js'
// const formToString = (x) => {
//   if (isWord(x)) return wordValue(x)
//   if (isList(x)) return `[${x.map(formToString).join(' ')}]`
//   throw new Error('log expects word or list')
// }
// defSetVar('log', (form) => {
//   console.log(print(form))
// })

// {
//   const macroCtx = makeInitInterpreter()
//   macroCtx.defSetVar('log', (form) => {
//     console.log('macro context logged:', print(form))
//   })
//   for (const name of ['std3', 'self-host-macros']) parseEvalFiles(macroCtx, `../wuns/${name}.wuns`)
//   const { getVarVal } = macroCtx
//   const hostTryGetMacro = (word) => {
//     if (isWord(word)) {
//       const n = wordValue(word)
//       const val = getVarVal(n)
//       // const metaData = meta(val)
//       if (n === 'defnt') {
//         console.log('defnt found', args)
//         return (...args) => {
//           console.log('defnt called', args)
//           return val(...args)
//         }
//       }
//       // console.log('hostTryGetMacro', wordValue(word), metaData, metaData['self-macro'])
//       // if (isMacro(val) || metaData['self-macro'])
//       return val
//     }
//     return 0
//   }
//   defSetVar('host-try-get-macro', hostTryGetMacro)
// }

// only for js host
const object_get = (m, k) => {
  const ks = wordValue(k)
  if (ks in m) return m[ks]
  throw new Error('key not found: ' + ks + ' in ' + Object.keys(m))
}
insertFunc('object-get', object_get)
const object_keys = (m) => {
  if (typeof m !== 'object') throw new Error('keys expects map')
  return arrayToList(Object.keys(m).map(word))
}
insertFunc('object-keys', object_keys)

parseEvalFiles(
  compile,
  ['std3', 'wasm-instructions', 'macro-expand', 'check', 'hosted', 'translate-test'].map(
    (name) => `../wuns/${name}.wuns`,
  ),
)
const getVarVal = (name) => defVars.get(name).value
getVarVal('test-main')(hostFuncTypes)

getVarVal('test-file')(parseFile(`../wuns/self-host.wuns`))
