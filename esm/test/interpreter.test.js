import { expect, assert, test, describe } from 'vitest'

const testEvaluator = ({ pe }) => {
  test('i32', () => {
    assert.throws(() => pe('[i32 0x80000000]'))
    assert.throws(() => pe('[i32 10n]'))
    assert.throws(() => pe('[i32]'))
    assert.throws(() => pe('[i32 1 2]'))

    expect(pe('[i32 1]')).toBe(1)
    expect(pe('[i32 007]')).toBe(7)
    expect(pe('[i32 0x10]')).toBe(16)
    expect(pe('[i32 0b10]')).toBe(2)
    expect(pe('[i32 0o10]')).toBe(8)
    expect(pe('[i32 0x7fffffff]')).toBe(2147483647)
    expect(pe('[i32 -1]')).toBe(-1)
    expect(pe('[i32 2147483647]')).toBe(2147483647)
    expect(pe('[i32 -2147483648]')).toBe(-2147483648)
  })

  test('f64', () => {
    assert.throws(() => pe('[f64]'))
    assert.throws(() => pe('[f64 1 2]'))
    expect(pe('[f64 1]')).toBe(1)
    expect(pe('[f64 -1]')).toBe(-1)
    expect(pe('[f64 2147483647]')).toBe(2147483647)
    expect(pe('[f64 -2147483648]')).toBe(-2147483648)
    expect(pe('[f64 0x7fffffff]')).toBe(2147483647)
    expect(pe('[f64 0x80000000]')).toBe(2147483648)

    expect(pe('[f64 1.9]')).toBe(1.9)
    expect(pe('[f64 -1.7]')).toBe(-1.7)

    // assert.throws(() => pe('[f64 1E40]'))
    expect(pe('[f64 1e40]')).toBe(1e40)
    expect(pe('[f64 -1e-40]')).toBe(-1e-40)
    expect(pe('[f64 -1e308]')).toBe(-1e308)
    expect(pe('[f64 1e308]')).toBe(1e308)
    expect(pe('[f64 1e309]')).toBe(Infinity)
    expect(pe('[f64 -1e309]')).toBe(-Infinity)
  })

  test('word', () => {
    assert.throws(() => pe('[word]'))
    assert.throws(() => pe('[word two words]'))
    // assert.throws(() => pe('[word _]'))

    expect(pe('[word a]')).toBe('a')
    expect(pe('[word abc]')).toBe('abc')
    expect(pe('[word abc123]')).toBe('abc123')
    expect(pe('[word abc-123]')).toBe('abc-123')
    expect(pe('[word 007]')).toBe('007')
  })

  test('intrinsics', () => {
    expect(pe('[intrinsic-call i32.add [i32 1] [i32 2]]')).toBe(3)
    expect(pe('[intrinsic-call i32.sub [i32 1] [i32 2]]')).toBe(-1)

    expect(pe('[intrinsic-call f64.sub [f64 1.5] [f64 2.5]]')).toBe(-1)
  })

  test('if', () => {
    expect(pe('[if [i32 1] [i32 2] [i32 3]]')).toBe(2)
    expect(pe('[if [i32 0] [i32 2] [i32 3]]')).toBe(3)
  })

  test('switch', () => {
    expect(pe('[switch [i32 1] [[i32 1]] [i32 2] [i32 3]]')).toBe(2)
    expect(
      pe(`[switch [i32 0]
      [[i32 0]] [word zero]
      [[i32 1]] [word one]
      [word not-01]]`),
    ).toBe('zero')
    expect(
      pe(`[switch [i32 1]
        [[i32 0]] [word zero]
        [[i32 1]] [word one]
        [word not-01]]`),
    ).toBe('one')
    expect(
      pe(`[switch [i32 10]
          [[i32 0]] [word zero]
          [[i32 1]] [word one]
          [word not-01]]`),
    ).toBe('not-01')
  })

  test('let', () => {
    assert.throws(() => pe('[let]'))
    assert.throws(() => pe('[let x]'))
    assert.throws(() => pe('[let x [i32 5] x]'))
    assert.throws(() => pe('[let [[] [i32 0]] ]'))

    expect(pe('[let []]')).toBe(langUndefined)
    expect(pe('[let [x [i32 5]]]')).toBe(langUndefined)
    expect(pe('[let [] [i32 2]]')).toBe(2)
    expect(pe('[let [x [i32 2]] x]')).toBe(2)
    expect(pe('[let [x [i32 2] y x] y]')).toBe(2)
    expect(pe('[let [x [i32 2] y [i32 5]] x]')).toBe(2)
    expect(pe('[let [x [i32 2] y [i32 5]] y]')).toBe(5)
    expect(pe('[let [x [i32 1] x [i32 2]] x]')).toBe(2)
    expect(pe('[let [x [i32 1]] [let [x [i32 1337]] x]]')).toBe(1337)
    expect(pe('[let [x [let [x [i32 1337]] x]] x]')).toBe(1337)
  })

  test('loop', () => {
    // loop acts as a let when it has no continue's in its body
    expect(pe('[loop [] [i32 1]]')).toBe(1)
    expect(pe('[loop [] [i32 2]]')).toBe(2)
    expect(pe('[loop [x [i32 2]] x]')).toBe(2)
    expect(pe('[loop [x [i32 2] y x] y]')).toBe(2)
    expect(pe('[loop [x [i32 1]] [loop [x [i32 1337]] x]]')).toBe(1337)
    expect(pe('[loop [x [loop [x [i32 1337]] x]] x]')).toBe(1337)

    // loop with continue
    // expect(pe('[loop [] [if [i32 1] [i32 5] [continue]]]')).toBe(5)
    assert.throws(() => pe('[loop [] [let [i [i32 5]] [continue i [i32 4]]]]'))
    assert.throws(() => pe('[loop [] [let [i [i32 5]] [continue [i32 5]]]]'))
    assert.throws(() => pe('[loop [] [let [i [i32 5]] [continue [i32 5] [i32 4]]]]'))
    // can we continue outer loops?
    assert.throws(() => pe(
      `[loop [i [i32 0]]
          [loop [j [i32 5]]
            [continue i [i32 5]]]]`))
    assert.throws(() => pe('[continue]'))
    const gauss = `
    [loop [i [i32 10] result [i32 0]]
      [if i
        [continue
          result [intrinsic-call i32.add result i]
          i [intrinsic-call i32.sub i [i32 1]]]
        result]]]`
    expect(pe(gauss)).toBe(55)
  })
}

import { makeEvalForm } from '../interpreter.js'
import { compEval } from '../compiler.js'
import { langUndefined, parseString } from '../core.js'

const parseCompEval = (s) => compEval(parseString(s, test)[0])
const parseEval = (s) => {
  const { evalExp } = makeEvalForm()
  return evalExp(parseString(s, test)[0])
}


describe.each([
  { name: 'direct', pe: parseEval },
  { name: 'compiled', pe: parseCompEval },
])('$name', testEvaluator)
