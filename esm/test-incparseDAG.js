import {
  parseString,
  getErrors,
  logNode,
} from './incparseDAG.js'

const okTests = ['', 'x', 'abc 123', '[]', '[ ]', '[quote 34]', `[if [eq 4 x] [] x]`, 'we-allow-dashes']
const errorTests = [
  [['illegal-characters'], '234 ILLEGAL but then legal'],
  [['extra-closing'], '[]]'],
  [['unclosed-list'], '[quote 34'],
]

const tests = okTests.map((test) => [[], test]).concat(errorTests)

for (const [expectedErrors, test] of tests) {
  const tree = parseString(test)
  console.log(`'${test}'`)
  // logNode(tree)
  const errors = getErrors(tree)
  if (expectedErrors.length !== errors.length) {
    console.log(`expected errors: ${expectedErrors.length} actual errors: ${errors.length}`)
    console.log(`expected: ${JSON.stringify(expectedErrors)} actual: ${JSON.stringify(errors)}`)
    continue
  }
  for (let i = 0; i < expectedErrors.length; i++) {
    if (expectedErrors[i] !== errors[i].message) {
      console.log(`expected error: ${expectedErrors[i]} actual error: ${errors[i].message}`)
      console.log(`expected: ${JSON.stringify(expectedErrors)} actual: ${JSON.stringify(errors)}`)
      break
    }
  }
  console.log()
  // console.log()

  // console.log(`'${treeToString(tree, bytes)}'`)
  // const { db } = tree
  // console.log(`db nodes: ${getTotalNumberOfNodes(db)} edges: ${calcTotalNumberOfEdges(db)}`)

}

// const deltas = [
//   {
//     oldText: '',
//     changes: [{ rangeOffset: 0, rangeLength: 0, text: 'a' }],
//     newText: 'a',
//   },
//   {
//     oldText: '',
//     changes: [{ rangeOffset: 0, rangeLength: 0, text: 'a' }],
//     newText: 'a',
//   },
//   {
//     oldText: 'a',
//     changes: [{ rangeOffset: 1, rangeLength: 0, text: 'b' }],
//     newText: 'ab',
//   },
//   {
//     oldText: 'ab',
//     changes: [{ rangeOffset: 0, rangeLength: 0, text: 'c' }],
//     newText: 'cab',
//   },
//   {
//     oldText: 'asdf',
//     changes: [{ rangeOffset: 0, rangeLength: 4, text: '' }],
//     newText: '',
//   },
//   {
//     oldText: 'asdf',
//     changes: [{ rangeOffset: 2, rangeLength: 0, text: ' ' }],
//     newText: 'as df',
//   },
//   {
//     oldText: 'asdf',
//     changes: [{ rangeOffset: 2, rangeLength: 0, text: 'x' }],
//     newText: 'asxdf',
//   },
//   {
//     oldText: 'as df',
//     changes: [{ rangeOffset: 2, rangeLength: 1, text: 'x' }],
//     newText: 'asxdf',
//   },
//   {
//     oldText: ']',
//     changes: [{ rangeOffset: 0, rangeLength: 0, text: '[' }],
//     newText: '[]',
//   },
//   {
//     oldText: '[]',
//     changes: [{ rangeOffset: 1, rangeLength: 1, text: '' }],
//     newText: '[',
//   },
//   {
//     oldText: '[]',
//     changes: [{ rangeOffset: 0, rangeLength: 1, text: '' }],
//     newText: ']',
//   },
//   {
//     oldText: '[list 1]',
//     changes: [{ rangeOffset: 0, rangeLength: 1, text: '' }],
//     newText: 'list 1]',
//   },
//   {
//     oldText: '[if 1 2]',
//     changes: [{ rangeOffset: 4, rangeLength: 3, text: '3' }],
//     newText: '[if 3]',
//   },
//   {
//     oldText: '[if [eq 0 x] [list 1 2 3]]',
//     changes: [{ rangeOffset: 4, rangeLength: 8, text: 'd' }],
//     newText: '[if d [list 1 2 3]]',
//   },
//   {
//     oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
//     changes: [{ rangeOffset: 11, rangeLength: 5, text: 'inc' }],
//     newText: '[if [eq 0 [inc x]] [list 1 2 3]]',
//   },
//   {
//     oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
//     changes: [{ rangeOffset: 11, rangeLength: 0, text: 'i' }],
//     newText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
//   },
//   {
//     oldText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
//     changes: [{ rangeOffset: 12, rangeLength: 2, text: 'f' }],
//     newText: '[if [eq 0 [ifd 1 x]] [list 1 2 3]]',
//   },
//   {
//     oldText: '[][[]]',
//     changes: [{ rangeOffset: 1, rangeLength: 4, text: 'x' }],
//     newText: '[x]',
//   },
//   {
//     oldText: 'asdf',
//     changes: [{ rangeOffset: 0, rangeLength: 4, text: '' }],
//     newText: '',
//   },
//   {
//     oldText: 'asdf',
//     changes: [{ rangeOffset: 2, rangeLength: 0, text: ' ' }],
//     newText: 'as df',
//   },
//   {
//     oldText: 'asdf',
//     changes: [{ rangeOffset: 2, rangeLength: 0, text: 'x' }],
//     newText: 'asxdf',
//   },
//   {
//     oldText: 'as df',
//     changes: [{ rangeOffset: 2, rangeLength: 1, text: 'x' }],
//     newText: 'asxdf',
//   },
//   {
//     oldText: '[if [eq 0 x] [list 1 2 3]]',
//     changes: [{ rangeOffset: 4, rangeLength: 8, text: 'd' }],
//     newText: '[if d [list 1 2 3]]',
//   },
//   {
//     oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
//     changes: [{ rangeOffset: 11, rangeLength: 5, text: 'inc' }],
//     newText: '[if [eq 0 [inc x]] [list 1 2 3]]',
//   },
//   {
//     oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
//     changes: [{ rangeOffset: 11, rangeLength: 0, text: 'i' }],
//     newText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
//   },
//   {
//     oldText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
//     changes: [{ rangeOffset: 12, rangeLength: 2, text: 'f' }],
//     newText: '[if [eq 0 [ifd 1 x]] [list 1 2 3]]',
//   },
//   {
//     oldText: '[if 3 []]\n[if 3 [list 1 2 3]]',
//     newText: '[if [3] []]\n[if [3] [list 1 2 3]]',
//     changes: [
//       { rangeOffset: 15, rangeLength: 0, text: ']' },
//       { rangeOffset: 14, rangeLength: 0, text: '[' },
//       { rangeOffset: 5, rangeLength: 0, text: ']' },
//       { rangeOffset: 4, rangeLength: 0, text: '[' },
//     ],
//   },
//   {
//     oldText: 'xy23\nxy23',
//     newText: 'xyz123\nxyz123',
//     changes: [
//       { rangeLength: 0, rangeOffset: 7, text: 'z1' },
//       { rangeLength: 0, rangeOffset: 2, text: 'z1' },
//     ],
//   },
// ]

// const assertDesc = (changes) => {
//   // check changes descending by offset
//   let offset = null
//   for (const { rangeOffset } of changes) {
//     if (offset !== null && rangeOffset > offset) throw new Error('expected changes to be sorted by offset')
//     offset = rangeOffset
//   }
// }

// const applyChanges = ({ oldText, changes }) => {
//   assertDesc(changes)
//   let newTextFromChanges = oldText
//   for (const { rangeOffset, rangeLength, text } of changes) {
//     const afterRange = newTextFromChanges.slice(rangeOffset + rangeLength)
//     const before = newTextFromChanges.slice(0, rangeOffset)
//     // console.log({ before, text, afterRange })
//     newTextFromChanges = before + text + afterRange
//   }

//   return newTextFromChanges
// }

// for (const delta of deltas) {
//   const { oldText, changes, newText } = delta
//   const newTextFromChanges = applyChanges(delta)
//   if (newTextFromChanges !== newText) {
//     console.log({ oldText, changes, newText, newTextFromChanges })
//     throw new Error('expected newTextFromChanges to equal newText')
//   }
//   const oldBytes = textEncoder.encode(oldText)
//   const tree = parse(oldBytes)
//   const errors = getErrors(tree)
//   if (errors.length) {
//     console.log(errors)
//     throw new Error('expected no errors')
//   }
//   const newBytes = textEncoder.encode(newText)
//   tree.changes.push(...changes)
//   const newTree = parse(newBytes, tree)
//   const newErrors = getErrors(newTree)
//   if (newErrors.length) {
//     console.log(newErrors)
//     throw new Error('expected no errors')
//   }
// }

// {
//   const db = makeDB()
//   const { createTerminal } = db
//   const word = (n) => createTerminal(nodeTypeWord, n)
//   const wspc = (n) => createTerminal(nodeTypeWhitespace, n)
//   const lsqb = () => createTerminal(nodeTypeStartBracket, 1)
//   const rsqb = () => createTerminal(nodeTypeEndBracket, 1)
//   const root = (...nodes) => createNonTerminal(nodeTypeRoot, sumByteLengths(nodes), nodes)
//   const list = (...nodes) => createNonTerminal(nodeTypeList, sumByteLengths(nodes), nodes)

//   const tests = [
//     { expected: 'err', tree: root(), drop: 0 },
//     { expected: root(word(1)), tree: root(word(1)), drop: 0 },
//     { expected: root(), tree: root(word(1)), drop: 1 },
//   ]

//   const tree = createNonTerminal(nodeTypeRoot, 1, [createTerminal(nodeTypeWord, 1)])
//   logNode(tree)

//   const cursor = newTreeCursor(tree)
//   const eventHandler = {
//     wentNextSibling: (node) => {
//       console.log('wentNextSibling', node)
//     },
//     wentToParent: () => {
//       console.log('wentToParent')
//     },
//     wentToFirstChild: () => {
//       console.log('wentToFirstChild')
//     },
//   }
//   advanceCursorToIndexN(cursor, 0, eventHandler)
//   console.log({ path: cursor.getPathCopy(), offset: cursor.getOffset() })
// }
