import { parseString } from '../core.js'
import { makeJSCompilingEvaluator } from '../compiler-js.js'

const filename = 'test-compile-wat.wuns'

import formsString from '../../wuns/test-compile-wat.wuns?raw'
import { test, expect } from 'vitest'

const { evalTops, getDef } = makeJSCompilingEvaluator()
await evalTops(parseString(formsString, filename))
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

  ['[let [x [i32 2]] [intrinsic i32.add x [i32 3]]]', 5],
  ['[let [x [i32 2] y [i32 3]] [intrinsic i32.add x y]]', 5],
])('%s -> %o', async (s, expected) => {
  const m = `[defn f [] ${s}] [export f]`
  expect((await stringToInst(m)).f()).toBe(expected)
})

test('defn', async () => {
  expect((await stringToInst('[defn f [] [i32 4]] [export f]')).f()).toBe(4)
  const inst = await stringToInst(`
[defn abs [p]
  [if [intrinsic i32.lt-s p [i32 0]]
    [intrinsic i32.sub [i32 0] p]
    p]]
[export abs]`)
  const { abs } = inst
  expect(abs(0)).toBe(0)
  expect(abs(4)).toBe(4)
  expect(abs(-4)).toBe(4)
  expect(abs(-2147483647)).toBe(2147483647)
  expect(abs(-2147483648)).toBe(-2147483648)
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

test('loop', async () => {
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

test ('memory', async () => {
  const inst = await stringToInst(`
[memory mem 1]
[defn get [p] [intrinsic i32.load mem 0 4 p]]
[defn set [p v] [intrinsic i32.store mem 0 4 p v]]
[export get set]`)
  const { get, set } = inst
  set(0, 5)
  expect(get(0)).toBe(5)
  set(0, 6)
  expect(get(0)).toBe(6)
  set(4, 7)
  expect(get(4)).toBe(7)
})

test ('hash', async () => {
  const inst = await stringToInst(`
[memory mem 1]
[def fnv-prime [i32 16777619]]
[def fnv-offset-basis [i32 -2128831035]]

[defn hash-fnv-1a-i32 [p len]
  [let [end-p [intrinsic i32.add p len]]
    [loop [hash fnv-offset-basis
           q p]
      [if [intrinsic i32.lt-s q end-p]
        [continue
          hash
          [intrinsic i32.mul
            [intrinsic i32.xor hash
              [intrinsic i32.load8-u mem 0 1 q]]
            fnv-prime]
          q [intrinsic i32.add q [i32 1]]]
        hash]]]]

[defn set-byte [p v] [intrinsic i32.store8 mem 0 1 p v]]

[export set-byte hash-fnv-1a-i32]`)
    const setByte = inst['set-byte']
    const hash = inst['hash-fnv-1a-i32']
    // hashing no characters should return offset basis
    expect(hash(0, 0)).toBe(-2128831035)

    // stolen from https://github.com/fnvhash/libfnv/blob/master/test/unit/basic_full.ts#L13
    setByte(0, 97) // a
    expect(hash(0, 1)).toBe(0xe40c292c | 0)

    // stolen from https://github.com/fnvhash/libfnv/blob/master/test/unit/basic_full.ts#L20
    'foobar'.split('').forEach((c, i) => setByte(i, c.charCodeAt(0)))
    expect(hash(0, 6)).toBe(0xbf9cf968 | 0)

})

import allocString from '../../wuns/ll/alloc.wuns?raw'

test('alloc', async () => {
  const inst = await stringToInst(allocString)
  const setByte = inst['set-byte']
  const parse = inst['parse']
  const setString = (s) => s.split('').forEach((c, i) => setByte(i, c.charCodeAt(0)))
  console.log(inst)
  setString('hello you')
  const res = parse(0, 9)
})