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

import { parseStringToForms, parseFile } from './parseTreeSitter.js'
import assert from 'node:assert'

const textDecoder = new TextDecoder()

const fileNames = ['std3', 'wasm-instructions', 'check', 'hosted']
const files = fileNames.map((name) => parseFile(`../wuns/${name}.wuns`))

// const compile = getVarVal('compile')
for (const { expected, wunsSrc, args } of [
  // { expected: [], wunsSrc: `[defn f []]` },
  { expected: 5, wunsSrc: `[defn f [] [i32.const 5]]` },
  { expected: 5n, wunsSrc: `[defn f [] [i64.const 5]]` },
  { expected: 6, wunsSrc: `[defn f [] [i32.const 5] [i32.const 6]]` },
  { expected: 5, wunsSrc: `[defn f [] [i32.add [i32.const 2] [i32.const 3]]]` },
  { expected: 5, wunsSrc: `[defn f [] [i32.sub [i32.const 8] [i32.const 3]]]` },
  {
    expected: 0,
    wunsSrc: `
[import env mem [memory 0]]
[defn f [] [i32.load [memarg mem 0 offset 0 align 1] [i32.const 0]]]`,
  },
  {
    expected: 5,
    wunsSrc: `
[import env mem [memory 0]]
[defn f []
  [i32.store [memarg mem 0 offset 0 align 1] [i32.const 0] [i32.const 5]]
  [i32.load [memarg mem 0 offset 0 align 1] [i32.const 0]]]`,
  },
  {
    expected: 5,
    wunsSrc: `
[defn f []
[if [i32.const 1] [i32.const 5] [i32.const 6]]
]`,
  },
  {
    expected: 6,
    wunsSrc: `
[defn f []
[if [i32.const 0] [i32.const 5] [i32.const 6]]
]`,
  },
  {
    expected: 6n,
    wunsSrc: `
[defn f []
[if [i32.const 0] [i64.const 5] [i64.const 6]]
]`,
  },
  {
    expected: 5n,
    wunsSrc: `
[defn f []
[if [i32.const 1] [i64.const 5] [i64.const 6]]
]`,
  },
  {
    expected: undefined,
    wunsSrc: `
[import env mem [memory 0]]
[defn f []
  [i32.store [memarg mem 0 offset 0 align 1] [i32.const 0] [i32.const 5]]]`,
  },
  {
    expected: undefined,
    wunsSrc: `
[import env mem [memory 0]]
[defn f []
  [if [i32.const 0]
    [i32.store [memarg mem 0 offset 0 align 1] [i32.const 0] [i32.const 5]]
    [i32.store [memarg mem 0 offset 0 align 1] [i32.const 0] [i32.const 6]]]]
  `,
  },
  {
    expected: 1,
    wunsSrc: `
[constant tag-word [i32.const 1]]
[defn f [] tag-word]
  `,
  },
  {
    expected: 5,
    wunsSrc: `[defn f [p] [i32.const 5]]`,
    args: [0],
  },
  {
    expected: 7,
    wunsSrc: `[defn f [p] p]`,
    args: [7],
  },
  {
    expected: 7,
    wunsSrc: `[defn f [p] [i32.add p [i32.const 1]]]`,
    args: [6],
  },
  //   {
  //     expected: 5,
  //     wunsSrc: `
  // [defn f []
  //   [let [x [i32.const 5]]
  //     x]]
  //   `,
  //   },
  //   },
  // { expected: [5, 6], wunsSrc: `[defn f [] [tuple [i32.const 5] [i32.const 6]]]` },
  // { expected: [5, 6], wunsSrc: `[defn is-power-of-2 [x i32] [i32.eq [i32.const 0] [i32.bitwise-and x [i32.sub x [i32.const 1]]]]]` },
]) {
  const forms = parseStringToForms(wunsSrc)

  const context = makeInterpreterContext({ importObject: {} })
  const { evalLogForms, getVarObject } = context
  for (const forms of files) evalLogForms(forms)
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
    // console.dir({ compRes })
    const printP = apply(printParen, compRes)
    const str = textDecoder.decode(Uint8Array.from(printP, (_, i) => +printP[i]))
    allText += str + '\n'
  }
  // console.log({ allText })
  const buf = mkParseWat(allText)
  const module = new WebAssembly.Module(buf)
  const inst = new WebAssembly.Instance(module, { env: { mem: new WebAssembly.Memory({ initial: 1 }) } })
  const { exports } = inst
  const call = (name, args) => {
    const f = exports[name]
    if (!f) throw new Error('call: ' + name)
    if (f.length !== args.length) throw new Error('call: ' + name + ' ' + args.length + ' ' + f.length)
    return f(...args)
  }
  const res = call('f', args ? args : [])
  assert.deepStrictEqual(res, expected)
}
