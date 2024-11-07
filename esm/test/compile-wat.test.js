import { parseString } from '../core.js'
import { makeJSCompilingEvaluator } from '../compiler-js.js'

const filename = 'test-compile-wat.wuns'

import stdFormsString from '../../wuns/test-compile-wat.wuns?raw'
import { test, expect } from 'vitest'

const stdForms = parseString(stdFormsString, filename)
const { evalTops, getDef } = makeJSCompilingEvaluator()
await evalTops(stdForms)
const translateAsync = getDef('translate-top-forms-async')
const moduleAsync = getDef('module-async')

const stringToInst = async (s, importObject) => {
  const forms = parseString(s, 'test-content')
  const module = await moduleAsync(...forms)
  const { exports } = new WebAssembly.Instance(module, importObject)
  return exports
}

test.each([
  ['[f64 1.5]', 1.5],
  ['[i32 5]', 5],

  ['[do]', undefined],
  ['[do [i32 5]]', 5],
  ['[do [i32 5] [i32 6]]', 6],

  ['[if [i32 0] [i32 7] [i32 5]]', 5],
  ['[if [i32 1] [i32 5] [i32 9]]', 5],
  ['[if [i32 1] [do] [do]]', undefined],

  ['[intrinsic i32.add [i32 2] [i32 3]]', 5],
  ['[intrinsic i32.sub [i32 8] [i32 3]]', 5],
  ['[intrinsic i32.mul [i32 5] [i32 3]]', 15],


])('%s -> %s', async (s, expected) => {
  const m = `[defn f [] ${s}] [export f]`
  expect((await stringToInst(m)).f()).toBe(expected)
})

test('test-compile-wat', async () => {
  expect((await stringToInst('[defn f [] [i32 4]] [export f]')).f()).toBe(4)
  expect((await stringToInst('[defn f [] [i32 4]] [export f]')).f()).toBe(4)
})

test('recursion', async () => {
  const inst = await stringToInst(`
  [defn gauss-direct [n]
    [if n
      [intrinsic i32.add n [gauss-direct [intrinsic i32.sub n [i32 1]]]]
      [i32 0]]]
  [export gauss-direct]`)
  expect(inst['gauss-direct'](10)).toBe(55)
  expect(inst['gauss-direct'](100)).toBe(5050)
  expect(inst['gauss-direct'](1000)).toBe(500500)
  expect(inst['gauss-direct'](10000)).toBe(50005000)
  // this would cause stack overflow
  // expect(inst['gauss-direct'](20000)).toBe(200010000)
})

test('loop', async() => {
  const inst = await stringToInst(`
    [defn gauss-loop [n]
      [loop [res [i32 0] i n]
        [if i
          [continue
            res [intrinsic i32.add res i]
            i [intrinsic i32.sub i [i32 1]]]
          res]]]
    [export gauss-loop]`)
  expect(inst['gauss-loop'](10)).toBe(55)
  expect(inst['gauss-loop'](100)).toBe(5050)
  expect(inst['gauss-loop'](1000)).toBe(500500)
  expect(inst['gauss-loop'](10000)).toBe(50005000)
  // no stack overflow with loop
  expect(inst['gauss-loop'](20000)).toBe(200010000)
  // the largest value before i32 wrap around
  expect(inst['gauss-loop'](65535)).toBe(2147450880)
})
