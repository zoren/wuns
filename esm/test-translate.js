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

import { makeInterpreterContext, apply } from './interpreter.js'

import { parseStringToForms } from './parseTreeSitter.js'
import assert from 'node:assert'

const textDecoder = new TextDecoder()

// const compile = getVarVal('compile')
for (const { expected, wunsSrc } of [
  // { expected: [], wunsSrc: `[defn f []]` },
  { expected: 5, wunsSrc: `[defn f [] [i32.const 5]]` },
  { expected: 5n, wunsSrc: `[defn f [] [i64.const 5]]` },
  { expected: 6, wunsSrc: `[defn f [] [i32.const 5] [i32.const 6]]` },
  { expected: 0, wunsSrc: `
[import env mem [memory 0]]
[defn f [] [i32.load [memarg mem 0 offset 0 align 1] [i32.const 0]]]
` },
  // { expected: [5, 6], wunsSrc: `[defn f [] [tuple [i32.const 5] [i32.const 6]]]` },
  // { expected: [5, 6], wunsSrc: `[defn is-power-of-2 [x i32] [i32.eq [i32.const 0] [i32.bitwise-and x [i32.sub x [i32.const 1]]]]]` },
]) {
  const forms = parseStringToForms(wunsSrc)

  const context = makeInterpreterContext({ importObject: {} })
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

  const compileTopForm = getVarVal('compile-top-form')
  const printParen = getVarVal('print-paren-form')
  let allText = ''
  for (const form of forms) {
    const compRes = apply(compileTopForm, form)
    const printP = apply(printParen, compRes)
    const str = textDecoder.decode(Uint8Array.from(printP, (_, i) => +printP[i]))
    allText += str + '\n'
  }
  // console.log({allText})
  const buf = mkParseWat(allText)
  const module = new WebAssembly.Module(buf)
  const inst = new WebAssembly.Instance(module, { env: { mem: new WebAssembly.Memory({ initial: 1 }) } })
  const { exports } = inst
  const call = (name, ...args) => {
    const f = exports[name]
    if (!f) throw new Error('call: ' + name)
    if (f.length !== args.length) throw new Error('call: ' + name + ' ' + args.length)
    return f(...args)
  }
  const res = call('f')
  assert.deepStrictEqual(res, expected)
}
