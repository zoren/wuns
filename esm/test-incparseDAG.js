import {
  parseString,
  getErrors,
  logNode,
  treesEqual,
  nodeTake,
  nodeDropMerge,
  mergeNodes,
  patchNode,
  lsqb,
  rsqb,
  word,
  wspc,
  ille,
  root,
  list,
  validateNode,
} from './incparseDAG.js'

const okTests = ['', 'x', 'abc 123', '[]', '[ ]', '[quote 34]', `[if [eq 4 x] [] x]`, 'we-allow-dashes']
const errorTests = [
  [['illegal-characters'], '234 ILLEGAL but then legal'],
  [['extra-closing'], '[]]'],
  [['unclosed-list'], '[quote 34'],
]

let nOfAsserts = 0

for (const [expectedErrors, test] of okTests.map((test) => [[], test]).concat(errorTests)) {
  const tree = parseString(test)
  const errors = getErrors(tree)
  if (expectedErrors.length !== errors.length) {
    console.log(`expected errors: ${expectedErrors.length} actual errors: ${errors.length}`)
    console.log(`expected: ${JSON.stringify(expectedErrors)} actual: ${JSON.stringify(errors)}`)
    continue
  }
  nOfAsserts++
  for (let i = 0; i < expectedErrors.length; i++) {
    if (expectedErrors[i] !== errors[i].message) {
      console.log(`expected error: ${expectedErrors[i]} actual error: ${errors[i].message}`)
      console.log(`expected: ${JSON.stringify(expectedErrors)} actual: ${JSON.stringify(errors)}`)
      break
    }
    nOfAsserts++
  }
}

const liop = (...nodes) => list(lsqb, ...nodes)
const licl = (...nodes) => list(lsqb, ...nodes, rsqb)

for (const { expected, node, index } of [
  { expected: root(word(1)), node: root(word(3)), index: 1 },
  { expected: root(word(2)), node: root(word(3)), index: 2 },
  { expected: root(word(3)), node: root(word(3)), index: 3 },

  { expected: root(word(3), wspc(1), word(2)), node: root(word(3), wspc(1), word(2)), index: 6 },
  { expected: root(word(3), wspc(1), word(1)), node: root(word(3), wspc(1), word(2)), index: 5 },
  { expected: root(word(3), wspc(1)), node: root(word(3), wspc(1), word(2)), index: 4 },
  { expected: root(word(3)), node: root(word(3), wspc(1), word(2)), index: 3 },
  { expected: root(word(2)), node: root(word(3), wspc(1), word(2)), index: 2 },
  { expected: root(word(1)), node: root(word(3), wspc(1), word(2)), index: 1 },

  { expected: root(liop()), node: root(licl()), index: 1 },
]) {
  if (!treesEqual(expected, nodeTake(node, index))) throw new Error('expected trees to be equal')
  nOfAsserts++
}

for (const { expected, node, index } of [
  { expected: root(word(3)), node: root(word(3)), index: 0 },
  { expected: root(word(2)), node: root(word(3)), index: 1 },
  { expected: root(word(1)), node: root(word(3)), index: 2 },

  { expected: root(word(1)), node: root(word(3), wspc(1), word(2)), index: 5 },
  { expected: root(word(2)), node: root(word(3), wspc(1), word(2)), index: 4 },
  { expected: root(wspc(1), word(2)), node: root(word(3), wspc(1), word(2)), index: 3 },
  { expected: root(word(1), wspc(1), word(2)), node: root(word(3), wspc(1), word(2)), index: 2 },
  { expected: root(word(2), wspc(1), word(2)), node: root(word(3), wspc(1), word(2)), index: 1 },
  { expected: root(word(3), wspc(1), word(2)), node: root(word(3), wspc(1), word(2)), index: 0 },

  { expected: root(rsqb), node: root(licl()), index: 1 },
  { expected: root(licl(), rsqb), node: root(licl(licl())), index: 1 },
  { expected: root(rsqb, rsqb), node: root(licl(licl())), index: 2 },
]) {
  const merged = nodeDropMerge(node, index)
  if (!treesEqual(expected, merged)) {
    console.log('original')
    logNode(node)
    console.log('expected')
    logNode(expected)
    console.log('merged')
    logNode(merged)
    throw new Error('expected trees to be equal')
  }
  nOfAsserts++
}

for (const { expected, input } of [
  {
    expected: root(),
    input: '',
  },
  {
    expected: root(word(3)),
    input: 'abc',
  },
  {
    expected: root(word(3), wspc(1), word(3)),
    input: 'abc 123',
  },
  {
    expected: root(word(3), wspc(1), ille(7), wspc(1), word(3)),
    input: 'abc ILLEGAL 123',
  },
  {
    expected: root(licl()),
    input: '[]',
  },
  {
    expected: root(liop()),
    input: '[',
  },
  {
    expected: root(rsqb),
    input: ']',
  },
  {
    expected: root(licl(), rsqb),
    input: '[]]',
  },
  {
    expected: root(liop(licl())),
    input: '[[]',
  },
  {
    expected: root(liop(licl(), liop())),
    input: '[[][',
  },
  {
    expected: root(licl(word(4), wspc(1), word(1), wspc(1), word(1))),
    input: '[list 1 2]',
  },
]) {
  const root = parseString(input)
  if (!treesEqual(expected, root)) {
    dir({ expected, root })
    throw new Error('expected trees to be equal')
  }
  nOfAsserts++
}

for (const { expected, a, b } of [
  { expected: root(), a: root(), b: root() },
  { expected: root(word(1)), a: root(word(1)), b: root() },
  { expected: root(word(1)), a: root(), b: root(word(1)) },

  { expected: root(word(2)), a: root(word(1)), b: root(word(1)) },
  { expected: root(word(2), wspc(1), word(3)), a: root(word(1)), b: root(word(1), wspc(1), word(3)) },

  { expected: root(licl(), word(2)), a: root(licl()), b: root(word(2)) },
]) {
  const merged = mergeNodes(a, b)
  if (!treesEqual(expected, merged)) {
    console.log('expected')
    logNode(expected)
    console.log('merged')
    logNode(merged)
    throw new Error('expected trees to be equal')
  }
  nOfAsserts++
}

for (const s of [
  '',
  'x',
  'ab 123',
  '] 34',
  '[abc 23',
  '[]',
  '[ ]',
  '[',
  ']',
  '[if [eq 1 [var c]] [quote 1] [quote 3]]',
]) {
  const expected = parseString(s)
  for (let i = 0; i < s.length + 1; i++) {
    const a = s.slice(0, i)
    const b = s.slice(i)
    const merged = mergeNodes(parseString(a), parseString(b))
    if (!treesEqual(expected, merged)) {
      console.log({ a, b, i })
      console.log('expected')
      logNode(expected)
      console.log('merged')
      logNode(merged)
      throw new Error('expected trees to be equal')
    }
    nOfAsserts++
  }
}

const deltas = [
  {
    oldText: '',
    changes: [{ rangeOffset: 0, rangeLength: 0, text: 'a' }],
    newText: 'a',
  },
  {
    oldText: '',
    changes: [{ rangeOffset: 0, rangeLength: 0, text: 'a' }],
    newText: 'a',
  },
  {
    oldText: 'a',
    changes: [{ rangeOffset: 1, rangeLength: 0, text: 'b' }],
    newText: 'ab',
  },
  {
    oldText: 'ab',
    changes: [{ rangeOffset: 0, rangeLength: 0, text: 'c' }],
    newText: 'cab',
  },
  {
    oldText: 'asdf',
    changes: [{ rangeOffset: 0, rangeLength: 4, text: '' }],
    newText: '',
  },
  {
    oldText: 'asdf',
    changes: [{ rangeOffset: 2, rangeLength: 0, text: ' ' }],
    newText: 'as df',
  },
  {
    oldText: 'asdf',
    changes: [{ rangeOffset: 2, rangeLength: 0, text: 'x' }],
    newText: 'asxdf',
  },
  {
    oldText: 'as df',
    changes: [{ rangeOffset: 2, rangeLength: 1, text: 'x' }],
    newText: 'asxdf',
  },
  {
    oldText: ']',
    changes: [{ rangeOffset: 0, rangeLength: 0, text: '[' }],
    newText: '[]',
  },
  {
    oldText: '[]',
    changes: [{ rangeOffset: 1, rangeLength: 1, text: '' }],
    newText: '[',
  },
  {
    oldText: '[]',
    changes: [{ rangeOffset: 0, rangeLength: 1, text: '' }],
    newText: ']',
  },
  {
    oldText: '[[]]',
    changes: [{ rangeOffset: 1, rangeLength: 0, text: 'i' }],
    newText: '[i[]]',
  },
  {
    oldText: '[list 1]',
    changes: [{ rangeOffset: 0, rangeLength: 1, text: '' }],
    newText: 'list 1]',
  },
  {
    oldText: '[[]a b]',
    changes: [{ rangeOffset: 0, rangeLength: 3, text: '' }],
    newText: 'a b]',
  },
  {
    oldText: '[if 1 2]',
    changes: [{ rangeOffset: 4, rangeLength: 3, text: '3' }],
    newText: '[if 3]',
  },
  {
    oldText: '[if [eq 0 x] [list 1 2 3]]',
    changes: [{ rangeOffset: 4, rangeLength: 8, text: 'd' }],
    newText: '[if d [list 1 2 3]]',
  },
  {
    oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
    changes: [{ rangeOffset: 11, rangeLength: 5, text: 'inc' }],
    newText: '[if [eq 0 [inc x]] [list 1 2 3]]',
  },
  {
    oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
    changes: [{ rangeOffset: 11, rangeLength: 0, text: 'i' }],
    newText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
  },
  {
    oldText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
    changes: [{ rangeOffset: 12, rangeLength: 2, text: 'f' }],
    newText: '[if [eq 0 [ifd 1 x]] [list 1 2 3]]',
  },
  {
    oldText: '[][[]]',
    changes: [{ rangeOffset: 1, rangeLength: 4, text: 'x' }],
    newText: '[x]',
  },
  {
    oldText: '[if [eq 0 x] [list 1 2 3]]',
    changes: [{ rangeOffset: 4, rangeLength: 8, text: 'd' }],
    newText: '[if d [list 1 2 3]]',
  },
  {
    oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
    changes: [{ rangeOffset: 11, rangeLength: 5, text: 'inc' }],
    newText: '[if [eq 0 [inc x]] [list 1 2 3]]',
  },
  {
    oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
    changes: [{ rangeOffset: 11, rangeLength: 0, text: 'i' }],
    newText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
  },
  {
    oldText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
    changes: [{ rangeOffset: 12, rangeLength: 2, text: 'f' }],
    newText: '[if [eq 0 [ifd 1 x]] [list 1 2 3]]',
  },
  {
    oldText: 'xy23\nxy23',
    newText: 'xyz123\nxyz123',
    changes: [
      { rangeOffset: 7, rangeLength: 0, text: 'z1' },
      { rangeOffset: 2, rangeLength: 0, text: 'z1' },
    ],
  },
  {
    oldText: '[if 3 []]\n[if 3 [list 1 2 3]]',
    newText: '[if [3] []]\n[if [3] [list 1 2 3]]',
    changes: [
      { rangeOffset: 15, rangeLength: 0, text: ']' },
      { rangeOffset: 14, rangeLength: 0, text: '[' },
      { rangeOffset: 5, rangeLength: 0, text: ']' },
      { rangeOffset: 4, rangeLength: 0, text: '[' },
    ],
  },
  { oldText: 's', changes: [{ rangeOffset: 1, rangeLength: 0, text: 'ø' }], newText: 'sø' },
  { oldText: 'søren', changes: [{ rangeOffset: 1, rangeLength: 1, text: '' }], newText: 'sren' },
  { oldText: 's💧ren', changes: [{ rangeOffset: 1, rangeLength: 2, text: 'ø' }], newText: 'søren' },
]

const assertDesc = (changes) => {
  // check changes descending by offset
  let offset = null
  for (const { rangeOffset } of changes) {
    if (offset !== null && rangeOffset > offset) throw new Error('expected changes to be sorted by offset')
    offset = rangeOffset
  }
}

const applyChanges = ({ oldText, changes }) => {
  assertDesc(changes)
  let newTextFromChanges = oldText
  for (const { rangeOffset, rangeLength, text } of changes) {
    newTextFromChanges =
      newTextFromChanges.slice(0, rangeOffset) + text + newTextFromChanges.slice(rangeOffset + rangeLength)
  }
  return newTextFromChanges
}

for (const delta of deltas) {
  const { oldText, changes, newText } = delta
  const newTextFromChanges = applyChanges(delta)
  if (newTextFromChanges !== newText) {
    console.log({ oldText, changes, newText, newTextFromChanges })
    throw new Error('expected newTextFromChanges to equal newText')
  }
  const oldTree = parseString(oldText)
  const patchedTree = patchNode(oldTree, changes)
  validateNode(patchedTree)
  const newTreeReparsed = parseString(newText)
  if (!treesEqual(patchedTree, newTreeReparsed)) {
    console.log({ oldText, changes, newText, newTextFromChanges })
    console.log('oldTree')
    logNode(oldTree)
    console.log('patchedTree')
    logNode(patchedTree)
    console.log('newTreeReparsed')
    logNode(newTreeReparsed)
    throw new Error('expected trees to be equal')
  }
  nOfAsserts++
}

console.log(`all tests passed (${nOfAsserts} asserts)`)
