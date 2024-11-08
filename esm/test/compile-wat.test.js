import { test, expect } from 'vitest'

import { stringToInst } from './wat-compile-util.js'

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
  {
    const inst = await stringToInst(`
    [defn gauss-loop [n]
      [loop [res [i32 0] i n]
        [if i
          [continue
            res [intrinsic i32.add res i]
            i [intrinsic i32.sub i [i32 1]]]
          res]]]
    [export gauss-loop]`)
    const gauss = inst['gauss-loop']
    expect(gauss(10)).toBe(55)
    expect(gauss(100)).toBe(5050)
    expect(gauss(1000)).toBe(500500)
    expect(gauss(10000)).toBe(50005000)
    // no stack overflow with loop
    expect(gauss(20000)).toBe(200010000)
    // the largest value before i32 wrap around
    expect(gauss(65535)).toBe(2147450880)
  }
  {
    const inst = await stringToInst(`
[load std.wuns]
[memory mem 1]

[defn set-byte [p v] [intrinsic i32.store8 mem 0 1 p v]]

[defn is-whitespace [c]
  [or [eq c [i32 32]] [eq c [i32 10]]]]

[defn is-word-char [c]
  [or
    [is-between-inclusive [i32 97] c [i32 122]]
    [is-between-inclusive [i32 45] c [i32 57]]]]

[defn scan-word [p end-p]
  [loop [q p]
    [if [lt-s q end-p]
      [if [is-word-char [intrinsic i32.load8-u mem 0 1 q]]
        [continue q [inc q]]
        q]
      q]]]

[export set-byte scan-word]`)
    const scanWord = inst['scan-word']
    const setByte = inst['set-byte']
    const setString = (s, p) => s.split('').forEach((c, i) => setByte(p + i, c.charCodeAt(0)))
    setString('hello you', 0)
    expect(scanWord(0, 9)).toBe(5)
    expect(scanWord(5, 9)).toBe(5)
    expect(scanWord(6, 9)).toBe(9)
  }
})

test('memory', async () => {
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

test('hash', async () => {
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

test('loop ifs', async () => {
  const inst = await stringToInst(`
[load std.wuns]
[memory mem 1]

[defn is-word-char [c]
  [or
    [is-between-inclusive [i32 97] c [i32 122]]
    [is-between-inclusive [i32 45] c [i32 57]]]]

[defn scan-word [p end-p]
  [loop [q p]
    [if [lt-s q end-p]
      [if [is-word-char [intrinsic i32.load8-u mem 0 1 q]]
        [continue q [inc q]]
        q]
      q]]]

[export scan-word]`)
})

import allocString from '../../wuns/ll/alloc.wuns?raw'

test('alloc', async () => {
  const inst = await stringToInst(allocString)
  const setByte = inst['set-byte']
  const countWords = inst['count-words']
  const setString = (s) => s.split('').forEach((c, i) => setByte(i, c.charCodeAt(0)))
  setString('   ')
  expect(countWords(0, 3)).toBe(0)

  setString('hello you')
  expect(countWords(0, 9)).toBe(2)
  expect(countWords(4, 9)).toBe(2)
  expect(countWords(5, 9)).toBe(1)

  setString('ILLEGAL')
  expect(countWords(0, 7)).toBe(-1)
})