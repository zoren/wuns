import { expect, assert, test, describe } from 'vitest'

import { langUndefined, parseString } from '../core.js'
import { makeEvalForm } from '../interpreter.js'
import { makeJSCompilingEvaluator } from '../compiler-js.js'

const testExp = ({ pe }) => {
  test('i32', () => {
    assert.throws(() => pe('[i32 10n]'))
    assert.throws(() => pe('[i32]'))
    assert.throws(() => pe('[i32 1 2]'))
    assert.throws(() => pe('[i32 not-a-number]'))
    assert.throws(() => pe('[i32 0x100000000]'))

    expect(pe('[i32 1]')).toBe(1)
    expect(pe('[i32 007]')).toBe(7)
    expect(pe('[i32 0x10]')).toBe(16)
    expect(pe('[i32 0b10]')).toBe(2)
    expect(pe('[i32 0o10]')).toBe(8)
    expect(pe('[i32 0x7fffffff]')).toBe(2147483647)
    expect(pe('[i32 0xffffffff]')).toBe(-1)
    expect(pe('[i32 0x80000000]')).toBe(-2147483648)
    expect(pe('[i32 0xff000000]')).toBe(0xff000000 | 0)
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
    assert.throws(() => pe('[intrinsic]'))
    assert.throws(() => pe('[intrinsic no-such-intrinsic]'))
    assert.throws(() => pe('[intrinsic i32.add]'))
    assert.throws(() => pe('[intrinsic i32.add [i32 1]]'))
    expect(pe('[intrinsic i32.add [i32 1] [i32 2]]')).toBe(3)
    expect(pe('[intrinsic i32.sub [i32 1] [i32 2]]')).toBe(-1)

    expect(pe('[intrinsic f64.sub [f64 1.5] [f64 2.5]]')).toBe(-1)
  })

  test('if', () => {
    assert.throws(() => pe('[if]'))
    assert.throws(() => pe('[if [i32 1]]'))
    assert.throws(() => pe('[if [i32 1] [i32 2]]'))
    assert.throws(() => pe('[if [i32 1] [i32 2] [i32 3] [i32 4]]'))

    expect(pe('[if [i32 1] [i32 2] [i32 3]]')).toBe(2)
    expect(pe('[if [i32 0] [i32 2] [i32 3]]')).toBe(3)
  })

  test('switch', () => {
    assert.throws(() => pe('[switch]'))
    assert.throws(() => pe('[switch [i32 1]]'))
    assert.throws(() => pe('[switch [i32 1] [i32 2] [i32 3]]'))
    assert.throws(() => pe('[switch [i32 1] [i32 2] [i32 3] [i32 4]]'))

    expect(pe('[switch [i32 1] [i32 5]]')).toBe(5)
    expect(pe('[switch [i32 0] [[i32 1]] [i32 11] [i32 12]]')).toBe(12)
    expect(pe('[switch [i32 1] [[i32 1]] [i32 11] [i32 12]]')).toBe(11)
    expect(
      pe(`[switch [i32 0]
            [[i32 0]] [i32 10]
            [[i32 1]] [i32 11]
            [i32 101]]`),
    ).toBe(10)
    expect(
      pe(`[switch [i32 1]
            [[i32 0]] [i32 10]
            [[i32 1]] [i32 11]
            [i32 101]]`),
    ).toBe(11)
    expect(
      pe(`[switch [i32 10]
            [[i32 0]] [i32 10]
            [[i32 1]] [i32 11]
            [i32 101]]`),
    ).toBe(101)
  })

  test('do', () => {
    expect(pe('[do]')).toBe(langUndefined)
    expect(pe('[do [i32 5]]')).toBe(5)
    expect(pe('[do [i32 5] [i32 6]]')).toBe(6)
    expect(pe('[do [let [x [i32 6]] x]]')).toBe(6)
    expect(pe('[do [let [x [i32 5]] x] [let [x [i32 6]] x]]')).toBe(6)
  })

  test('let', () => {
    assert.throws(() => pe('[let]'))
    assert.throws(() => pe('[let x]'))
    assert.throws(() => pe('[let x [i32 5] x]'))
    assert.throws(() => pe('[let [[] [i32 0]]]'))
    assert.throws(() => pe('[let [x [i32 0]] no-such]'))

    expect(pe('[let []]')).toBe(langUndefined)
    expect(pe('[let [x [i32 5]]]')).toBe(langUndefined)
    expect(pe('[let [] [i32 2]]')).toBe(2)
    expect(pe('[let [x [i32 2]] x]')).toBe(2)
    expect(pe('[let [x [let [x [i32 2]] x]] x]')).toBe(2)
    expect(pe('[let [x [i32 2] y x] y]')).toBe(2)
    expect(pe('[let [x [i32 2] y [i32 5]] x]')).toBe(2)
    expect(pe('[let [x [i32 2]] [intrinsic i32.add x [i32 3]]]')).toBe(5)
    expect(
      pe(`
[let
  [x [i32 2]
   x [intrinsic i32.add x [i32 3]]
  ]
  x]`),
    ).toBe(5)
    expect(pe('[let [x [i32 2] x [intrinsic i32.add x [i32 3]]] x]')).toBe(5)

    expect(pe('[let [x [i32 2] y [i32 5]] y]')).toBe(5)
    expect(pe('[let [x [i32 1] x [i32 2]] x]')).toBe(2)
    expect(pe('[let [x [i32 1] x [intrinsic i32.add x [i32 1]]] x]')).toBe(2)
    expect(pe('[let [x [i32 1]] [let [x [i32 1337]] x]]')).toBe(1337)
    expect(pe('[let [x [let [x [i32 1337]] x]] x]')).toBe(1337)
  })

  test('loop continue', () => {
    // loop acts as a let when it has no continue's in its body
    expect(pe('[loop [] [i32 1]]')).toBe(1)
    expect(pe('[loop [] [i32 2]]')).toBe(2)
    expect(pe('[loop [x [i32 2]] x]')).toBe(2)
    expect(pe('[loop [x [i32 2] y x] y]')).toBe(2)
    expect(pe('[loop [x [i32 1]] [loop [x [i32 1337]] x]]')).toBe(1337)
    expect(pe('[loop [x [loop [x [i32 1337]] x]] x]')).toBe(1337)
    expect(
      pe(`
      [loop
        [x [i32 2]
         x [intrinsic i32.add x [i32 3]]
        ]
        x]`),
    ).toBe(5)
    // loop with continue
    // expect(pe('[loop [] [if [i32 1] [i32 5] [continue]]]')).toBe(5)
    assert.throws(() => pe('[loop [] [let [i [i32 5]] [continue i [i32 4]]]]'))
    assert.throws(() => pe('[loop [] [let [i [i32 5]] [continue [i32 5]]]]'))
    assert.throws(() => pe('[loop [] [let [i [i32 5]] [continue [i32 5] [i32 4]]]]'))
    // can we continue outer loops?
    assert.throws(() =>
      pe(
        `[loop [i [i32 0]]
          [loop [j [i32 5]]
            [continue i [i32 5]]]]`,
      ),
    )
    assert.throws(() => pe('[continue]'))
    const gauss = `
    [loop [i [i32 10] result [i32 0]]
      [if i
        [continue
          result [intrinsic i32.add result i]
          i [intrinsic i32.sub i [i32 1]]]
        result]]`
    expect(pe(gauss)).toBe(55)
    // non-tail loop
    expect(pe(`[do ${gauss} [i32 5]]`)).toBe(5)
  })

  test('func', () => {
    assert.throws(() => pe('[func]'))
    assert.throws(() => pe('[func []]'))
    assert.throws(() => pe('[func []]'))
    assert.throws(() => pe('[func f [[]]]'))

    expect(pe('[func f []]')).toBeTypeOf('function')
    expect(pe('[func myfuncname []]')).toSatisfy((f) => f.name === 'myfuncname')
    expect(pe('[func f [] [i32 1]]')).toBeTypeOf('function')

    expect(pe('[[func f []]]')).toBe(langUndefined)
    expect(pe('[[func f [] [i32 1]]]')).toBe(1)
    expect(pe('[[func f [p] p] [i32 1]]')).toBe(1)
    expect(pe('[[func f [p q] p] [i32 1] [i32 2]]')).toBe(1)
    expect(pe('[[func f [p q] q] [i32 1] [i32 2]]')).toBe(2)
    expect(pe('[[func f [p q r] r] [i32 1] [i32 2] [i32 3]]')).toBe(3)
    expect(pe('[[func list [.. r] r] [i32 1] [i32 2] [i32 3]]')).toStrictEqual([1, 2, 3])
    const gaussDirectRecursive = pe(`
[func go [n]
  [if n
    [intrinsic i32.add n [go [intrinsic i32.sub n [i32 1]]]]
    [i32 0]]]`)
    expect(gaussDirectRecursive).toBeTypeOf('function')
    expect(gaussDirectRecursive(10)).toBe(55)
    expect(gaussDirectRecursive(100)).toBe(5050)

    const gaussTailRecursive = pe(`
    [func go [res n]
      [if n
        [go [intrinsic i32.add res n] [intrinsic i32.sub n [i32 1]]]
        res]]`)
    expect(gaussTailRecursive).toBeTypeOf('function')
    expect(gaussTailRecursive(0, 10)).toBe(55)
    expect(gaussTailRecursive(0, 100)).toBe(5050)
    expect(gaussTailRecursive(0, 1000)).toBe(500500)
  })

  test('letfn', () => {
    assert.throws(() => pe('[letfn]'))
    assert.throws(() => pe('[letfn f]'))

    expect(pe('[letfn []]')).toBe(langUndefined)
    expect(
      pe(`
[letfn [
  [func f [] [i32 1]]
  [func f [] [i32 2]]]
  [f]]`),
    ).toBe(2)
    {
      const isEvenSlow = pe(`
      [letfn
        [[func is-even [n]
          [if n
            [is-odd [intrinsic i32.sub n [i32 1]]]
            [i32 1]]]
          [func is-odd [n]
          [if n
            [is-even [intrinsic i32.sub n [i32 1]]]
            [i32 0]]]]
        is-even]`)
      expect(isEvenSlow(0)).toBe(1)
      expect(isEvenSlow(2)).toBe(1)
      expect(isEvenSlow(22)).toBe(1)
    }
    {
      const isEvenSlowWrapped = pe(`
[func is-even-slow-letfn [outer-n]
  [letfn
    [[func is-even [n]
      [if n
        [is-odd [intrinsic i32.sub n [i32 1]]]
        [i32 1]]]
     [func is-odd [n]
      [if n
        [is-even [intrinsic i32.sub n [i32 1]]]
        [i32 0]]]]
    [is-even outer-n]]]`)
      expect(isEvenSlowWrapped(0)).toBe(1)
      expect(isEvenSlowWrapped(2)).toBe(1)
      expect(isEvenSlowWrapped(22)).toBe(1)
    }
  })

  test('type-anno', () => {
    expect(pe('[type-anno [i32 1] i32]')).toBe(1)
  })
}

const makeParseEvalExp = (makeEvaluator) => {
  return (s) => {
    const forms = parseString(s, 'test')
    if (forms.length !== 1) throw new Error(`Expected 1 form, got ${forms.length}`)
    const { evalExp } = makeEvaluator()
    return evalExp(forms[0])
  }
}

describe.each([
  { name: 'exp direct', pe: makeParseEvalExp(makeEvalForm) },
  { name: 'exp compiled js', pe: makeParseEvalExp(makeJSCompilingEvaluator) },
])('$name', testExp)

const testTop = ({ ptse }) => {
  test('def', async () => {
    expect(await ptse('[def x [i32 5]] x')).toBe(5)
    expect(await ptse('[def x [i32 5]] [def y x] y')).toBe(5)
    expect(await ptse('[def x-hyphenated [i32 5]] [def y x-hyphenated] y')).toBe(5)
  })
  test('defn', async () => {
    expect(await ptse('[defn f [] [i32 5]] [f]')).toBe(5)
    expect(await ptse('[defn f [] [i32 5]] [defn g [] [f]] [g]')).toBe(5)
    expect(await ptse('[defn f [x] [intrinsic i32.add x x]] [defn g [y] [f y]] [g [i32 4]]')).toBe(8)
    expect(await ptse('[defn inc [p] [intrinsic i32.add p [i32 1]]] [inc [i32 4]]')).toBe(5)
    expect(await ptse('[defn list [.. elements] elements] [list [i32 1] [i32 2]]')).toStrictEqual([1, 2])
    expect(
      await ptse(`
      [defn gauss-direct [n]
        [if n
          [intrinsic i32.add n [gauss-direct [intrinsic i32.sub n [i32 1]]]]
          [i32 0]]]
      [gauss-direct [i32 10]]`),
    ).toBe(55)
  })

  const formWord = (w) => ({ tag: 'form/word', args: [w] })
  const formList = (...elements) => ({ tag: 'form/list', args: [elements] })

  test('defexpr', async () => {
    expect(await ptse('[defexpr q [p] p] [q a]')).toStrictEqual(formWord('a'))
    expect(await ptse('[defexpr q [p] p] [q []]')).toStrictEqual(formList())
    expect(await ptse('[defexpr q [p] p] [q [[]]]')).toStrictEqual(formList(formList()))
    expect(await ptse('[defexpr q [p] p] [q [i32 5]]')).toStrictEqual(formList(formWord('i32'), formWord('5')))
  })

  test('defmacro', async () => {
    {
      const code = `
  [defexpr q [p] p]
  [defmacro m [] [q [i32 5]]]
  [m]`
      expect(await ptse(code)).toBe(5)
    }

    expect(await ptse('[defmacro m [p] p] [m [i32 5]]')).toBe(5)
    expect(
      await ptse(`
      [type form []
  [union
    [word word]
    [list [list form]]]]

[defn flist [.. elements] [form/list elements]]

[defn list [.. entries] entries]

[defexpr quote [f] f]

[defmacro def-extern [name type]
  [flist [quote import] [quote ./runtime-lib/host.js] name type]]

[def-extern concat [type-scheme [a] [func [[list a] [list a]] [list a]]]]
[i32 0]
      `),
    )
  })

  test('do', async () => {
    expect(await ptse('[do] [i32 5]')).toBe(5)
    expect(await ptse('[do [do]] [i32 5]')).toBe(5)
    expect(await ptse('[do [def x [i32 5]] [def y x]] y')).toBe(5)
  })

  test('import', async () => {
    expect(
      await ptse('[import ./runtime-lib/host.js concat [type-scheme [a] [func [[list a] [list a]] [list a]]]] concat'),
    ).toBeTypeOf('function')
  })

  test('type union', async () => {
    expect(await ptse('[type option [a] [union [none] [some a]]] [option/none]')).toStrictEqual({
      tag: 'option/none',
      args: [],
    })
    expect(await ptse('[type option [a] [union [none] [some a]]] [option/some [i32 5]]')).toStrictEqual({
      tag: 'option/some',
      args: [5],
    })
    expect(
      await ptse(`
      [type bool [] [union [false] [true]]]
      [match [bool/true]
        [bool/true] [i32 1]
        [bool/false] [i32 0]]`),
    ).toStrictEqual(1)
    expect(
      await ptse(`
      [type bool [] [union [false] [true]]]
      [match [bool/false]
        [bool/true] [i32 1]
        [bool/false] [i32 0]]`),
    ).toStrictEqual(0)
    expect(
      await ptse(`
      [type bool [] [union [false] [true]]]
      [match [bool/false]
        [bool/false] [i32 0]]`),
    ).toStrictEqual(0)
    expect(
      await ptse(`
      [type bool [] [union [false] [true]]]
      [match [bool/true]
        [bool/false] [i32 0]
        [word default]]`),
    ).toBe('default')
    await expect(
      ptse(`
      [type bool [] [union [false] [true]]]
      [match [bool/true]
        [bool/false] [i32 0]]`),
    ).rejects.toThrow('no match')
    expect(
      await ptse(`
  [type option [a] [union [none] [some a]]]
  [match [option/some [i32 5]]
    [option/some p] p]`),
    ).toStrictEqual(5)
    expect(
      await ptse(`
  [type option [a] [union [none] [some a]]]
  [match [option/some [i32 5]]
    [option/none] [i32 0]
    [option/some p] p
    ]`),
    ).toStrictEqual(5)
    expect(
      await ptse(`
      [type option [a] [union [none] [some a]]]
      [match [option/none]
        [option/none] [i32 0]
        [option/some p] p
        ]`),
    ).toStrictEqual(0)
    expect(
      await ptse(`
      [type bool [] [union [false] [true]]]
      [defn f []
        [match [bool/false]
          [bool/true] [i32 4]
          [bool/false] [i32 5]]]
      [f]`),
    ).toBe(5)
    expect(
      await ptse(`
      [type bool [] [union [false] [true]]]
      [defn f []
        [match [bool/false]
          [bool/true] [i32 4]
          [bool/false] [i32 5]]
        [i32 6]]
      [f]`),
    ).toBe(6)
    // test for compiler bug where match parameters would become assignments not const declarations
    expect(
      await ptse(`
  [type option [a] [union [none] [some a]]]
  [loop [p [i32 0]]
    [match [option/some [i32 5]]
      [option/some p] p]
    p]`),
    ).toBe(0)
  })

  test('type record', async () => {
    expect(await ptse('[type empty [] [record]] [empty]')).toStrictEqual({})
    expect(await ptse('[type pair [a b] [record [fst a] [snd b]]] [pair/fst [pair [i32 5] [i32 6]]]')).toBe(5)
    expect(await ptse('[type pair [a b] [record [fst a] [snd b]]] [pair/snd [pair [i32 5] [i32 6]]]')).toBe(6)
  })
}

const makeParseEvalTopsExp = (makeEvaluator) => {
  return async (s) => {
    const forms = parseString(s, 'test')
    if (forms.length === 0) throw new Error(`Expected at least 1 form, got 0`)
    const { evalTop, evalExp } = makeEvaluator()
    for (let i = 0; i < forms.length - 1; i++) await evalTop(forms[i])
    return evalExp(forms.at(-1))
  }
}

const parseEvalTopsExpJS = async (s) => {
  const forms = parseString(s, 'test')
  if (forms.length === 0) throw new Error(`Expected at least 1 form, got 0`)
  const { evalTopsExp } = makeJSCompilingEvaluator()
  return await evalTopsExp(forms)
}

describe.each([
  { name: 'top direct', ptse: makeParseEvalTopsExp(makeEvalForm) },
  {
    name: 'top compiled js',
    ptse: parseEvalTopsExpJS,
  },
])('$name', testTop)
