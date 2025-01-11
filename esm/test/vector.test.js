import { test, expect, assert } from 'vitest'
import { stringToInst } from './test-util.js'

import vectorWuns from '../../wuns/vector.wuns?raw'

// import fs from 'fs'
// const formsToWatText = getDef('forms-to-wat-text')
// fs.writeFileSync('vector.wat', formsToWatText(parseString(vectorWuns, 'vector.wuns')))

test('vector', async () => {
  const inst = await stringToInst(vectorWuns, 'vector.wuns')
  const allocInit = inst['alloc-init']
  const vectorFloat = inst['vector-float']
  const size = inst['size']
  allocInit()

  vectorFloat(3)
  const vf = vectorFloat(3)

  expect(size(vf)).toBe(3)

  const setFloat = inst['set-float']
  const getFloat = inst['get-float']

  assert.throws(() => setFloat(vf, -1, 9), 'unreachable')
  assert.throws(() => setFloat(vf, 3, 9), 'unreachable')
  assert.throws(() => setFloat(vf, 4, 9), 'unreachable')

  setFloat(vf, 0, 3.4)
  setFloat(vf, 1, 5.7)
  setFloat(vf, 2, 7.9)

  expect(size(vf)).toBe(3)

  expect(getFloat(vf, 0)).toBe(3.4)
  expect(getFloat(vf, 1)).toBe(5.7)
  expect(getFloat(vf, 2)).toBe(7.9)

  const vectorInt = inst['vector-int']
  const vi = vectorInt(3)
  expect(size(vi)).toBe(3)
  const setInt = inst['set-int']
  const getInt = inst['get-int']
  setInt(vi, 0, 3)
  setInt(vi, 1, 5)
  setInt(vi, 2, 7)
  expect(getInt(vi, 0)).toBe(3)
  expect(getInt(vi, 1)).toBe(5)
  expect(getInt(vi, 2)).toBe(7)

  const vectorByte = inst['vector-byte']
  const vb = vectorByte(3)
  expect(size(vb)).toBe(3)
  const setByte = inst['set-byte']
  const getByte = inst['get-byte']
  setByte(vb, 0, 3)
  setByte(vb, 1, 5)
  setByte(vb, 2, 7)
  expect(getByte(vb, 0)).toBe(3)
  expect(getByte(vb, 1)).toBe(5)
  expect(getByte(vb, 2)).toBe(7)
  const encoder = new TextEncoder()
  const stringToByteVector = (s) => {
    const bytes = encoder.encode(s)
    const vb = vectorByte(bytes.length)
    bytes.forEach((b, i) => setByte(vb, i, b))
    return vb
  }
  const pwordToString = (p) => {
    const s = size(p)
    const bytes = new Uint8Array(s)
    for (let i = 0; i < s; i++) {
      bytes[i] = getByte(p, i)
    }
    return String.fromCharCode(...bytes)
  }
  {
    const parse = inst['parse']
    const formGetWord = inst['form-get-word']
    const formGetList = inst['form-get-list']

    const expectForm = (actualPointer, expectedForm) => {
      if (expectedForm === null) {
        expect(actualPointer).toBe(0)
      } else if (typeof expectedForm === 'string') {
        const actualWord = formGetWord(actualPointer)
        expect(pwordToString(actualWord)).toEqual(expectedForm)
      } else if (Array.isArray(expectedForm)) {
        const actualList = formGetList(actualPointer)
        expect(size(actualList)).toEqual(expectedForm.length)
        for (let i = 0; i < expectedForm.length; i++) {
          expectForm(getInt(actualList, i), expectedForm[i])
        }
      } else {
        console.log({ expectedForm })
        throw new Error('unreachable')
      }
    }
    const expectFormString = (stringInput, expectedForm) =>
      expectForm(parse(stringToByteVector(stringInput)), expectedForm)

    expectFormString('', null)
    expectFormString(' ', null)
    expectFormString(' \n', null)
    expectFormString(' \n\n ', null)
    expectFormString(' abc ', 'abc')
    expectFormString('abc ', 'abc')
    expectFormString('abc', 'abc')
    expectFormString(' abc hej ', 'abc')
    expectFormString(' abc [] ', 'abc')
    expectFormString(' abc [] ', 'abc')
    expectFormString(' abc[] ', 'abc')
    expectFormString(' abc-def ', 'abc-def')
    expectFormString(' -1337.34 ', '-1337.34')

    expectFormString(' [abc def] ', ['abc', 'def'])
    expectFormString(' [abc] ', ['abc'])
    expectFormString(' [a] ', ['a'])
    expectFormString(' [] ', [])
  }
  {
    const growableVectorInt = inst['growable-vector-make-int']
    const pushInt = inst['growable-vector-push-int']
    const growableVectorToVector = inst['growable-vector-to-vector-int']
    const gv = growableVectorInt(3)
    // expect(size(gv)).toBe(0)
    pushInt(gv, 3)
    pushInt(gv, 5)
    pushInt(gv, 7)
    assert.throws(() => pushInt(gv, 9), 'unreachable')
    const fixedVector = growableVectorToVector(gv)
    expect(size(fixedVector)).toBe(3)
    expect(getInt(fixedVector, 0)).toBe(3)
    expect(getInt(fixedVector, 1)).toBe(5)
    expect(getInt(fixedVector, 2)).toBe(7)
  }
  {
    const vectorByteHash = inst['vector-u8-hash-fnv-1a-i32']
    // hashing no characters should return offset basis
    expect(vectorByteHash(stringToByteVector(''))).toBe(-2128831035)
    // stolen from https://github.com/fnvhash/libfnv/blob/master/test/unit/basic_full.ts#L13
    expect(vectorByteHash(stringToByteVector('a'))).toBe(0xe40c292c | 0)
    // stolen from https://github.com/fnvhash/libfnv/blob/master/test/unit/basic_full.ts#L20
    expect(vectorByteHash(stringToByteVector('foobar'))).toBe(0xbf9cf968 | 0)
  }
  {
    const vectorByteEqual = inst['vector-eq-u8']
    const foo = stringToByteVector('foo')
    const foobar = stringToByteVector('foobar')
    const foobar2 = stringToByteVector('foobar')
    expect(vectorByteEqual(foo, foobar)).toBe(0)
    expect(vectorByteEqual(foobar, foo)).toBe(0)
    expect(vectorByteEqual(foobar, foobar)).toBe(1)
    expect(vectorByteEqual(foobar, foobar2)).toBe(1)
  }
})
