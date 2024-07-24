import wabtProm from 'wabt'
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
  const module = wabt.parseWat('', s, { multi_memory: true })
  module.resolveNames()
  module.validate()
  const { buffer } = module.toBinary({
    log: true,
    write_debug_names: true,
  })
  return buffer
}

// const buf = mkParseWat(s)
// const module = new WebAssembly.Module(buf)
// const inst = new WebAssembly.Instance(module, {})
// const { exports } = inst
// const call = (name, ...args) => exports[name](...args)
// (func (export "f") (result i32 i32)
//   (i32.const 42)
//   (i32.const 43)
//   )
import { makeInterpreterContext, apply } from './interpreter.js'

const tests = [
  { expected: [], wunsSrc: `[defn f []]` },
  { expected: 5, wunsSrc: `[defn f [] [i32.const 5]]` },
  { expected: 6, wunsSrc: `[defn f [] [i32.const 5] [i32.const 6]]` },
  // { expected: [5, 6], wunsSrc: `[defn f [] [tuple [i32.const 5] [i32.const 6]]]` },
  // { expected: [5, 6], wunsSrc: `[defn is-power-of-2 [x i32] [i32.eq [i32.const 0] [i32.bitwise-and x [i32.sub x [i32.const 1]]]]]` },
]

const memory = new WebAssembly.Memory({ initial: 1 })
const context = makeInterpreterContext({
  importObject: {
    env: {
      mem: memory,
    },
  },
})
const { parseEvalFile, getVarObject } = context
parseEvalFile('../wuns/std3.wuns')
parseEvalFile('../wuns/wasm-instructions.wuns')
parseEvalFile('../wuns/check.wuns')
parseEvalFile('../wuns/hosted.wuns')

// const getVarVal = (name) => getVarObject(name).getValue()
const getVarVal = (name) => {
  const vo = getVarObject(name)
  if (!vo) throw new Error('getVarVal: ' + name)
  return vo.getValue()
}
// apply(getVarVal('bump-alloc-init'))
// const bumpAlloc = getVarVal('bump-alloc')

// const bufferWord = apply(bumpAlloc, 64)
// const bufferNum = parseInt(bufferWord)

import { parseStringToForms } from './parseTreeSitter.js'
import assert from 'node:assert'

const textDecoder = new TextDecoder()
// const treeToForm = getVarVal('tree-to-form')
const compileTopForm = getVarVal('compile-top-form')
const printParen = getVarVal('print-paren-form')

// const compile = getVarVal('compile')
for (const { expected, fname, wunsSrc } of [
  // { expected: [], wunsSrc: `[defn f []]` },
  { expected: 5, fname: 'f',  wunsSrc: `[defn f [] [i32.const 5]]` },
  { expected: 5n, fname: 'g', wunsSrc: `[defn g [] [i64.const 5]]` },
  // { expected: 6, wunsSrc: `[defn f [] [i32.const 5] [i32.const 6]]` },
  // { expected: [5, 6], wunsSrc: `[defn f [] [tuple [i32.const 5] [i32.const 6]]]` },
  // { expected: [5, 6], wunsSrc: `[defn is-power-of-2 [x i32] [i32.eq [i32.const 0] [i32.bitwise-and x [i32.sub x [i32.const 1]]]]]` },
]) {
  const forms = parseStringToForms(wunsSrc)
  // const { cur, end } = copyInput('[i32.const 123]')
  for (const form of forms) {
    const compRes = apply(compileTopForm, form)
    const printP = apply(printParen, compRes)

    const str = textDecoder.decode(Uint8Array.from({ length: printP.length }, (_, i) => +printP[i]))
    // console.dir({ form, compRes, str }, { depth: null })
    const buf = mkParseWat(str)
    const module = new WebAssembly.Module(buf)
    const inst = new WebAssembly.Instance(module, {})
    const { exports } = inst
    const call = (name, ...args) => {
      const f = exports[name]
      if (!f) throw new Error('call: ' + name)
      if (f.length !== args.length) throw new Error('call: ' + name + ' ' + args.length)
      return f(...args)
    }
    const res = call(fname)
    assert.deepStrictEqual(res, expected)
  }
}
