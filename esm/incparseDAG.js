const isWhitespace = (c) => c === 32 || c === 9 || c === 10
const otherWordChars = new Set([...'.=/-'].map((c) => c.charCodeAt(0)))
const isWordChar = (c) => (97 <= c && c <= 122) || (48 <= c && c <= 57) || otherWordChars.has(c)

const nodeTypeList = 'list'
const nodeTypeRoot = 'root'
const nodeTypeStartBracket = '['
const nodeTypeEndBracket = ']'
const nodeTypeWord = 'word'
const nodeTypeWhitespace = 'whitespace'
const nodeTypeIllegalChars = 'illegal-chars'

const makeDB = () => {
  const terminalCache = new Map()
  return { terminalCache }
}

const internalParseDAG = (inputBytes, { terminalCache }) => {
  const createTerminal = (type, byteLength) => {
    let cached = terminalCache.get(type)
    if (cached === undefined) {
      cached = new Map()
      terminalCache.set(type, cached)
    }
    let cachedNode = cached.get(byteLength)
    if (cachedNode === undefined) {
      cachedNode = Object.freeze({ type, byteLength })
      cached.set(byteLength, cachedNode)
    }
    return cachedNode
  }
  const createNonTerminal = (type, byteLength, children) => {
    if (children.reduce((acc, { byteLength }) => acc + byteLength, 0) !== byteLength)
      throw new Error('expected sum of child byte lengths to equal byte length')
    return Object.freeze({ type, byteLength, children: Object.freeze(children) })
  }
  let i = 0
  const go = () => {
    if (i >= inputBytes.length) return null
    const c = inputBytes[i]
    switch (c) {
      case 91: {
        const children = [createTerminal(nodeTypeStartBracket, 1)]
        const start = i
        i++
        while (true) {
          const elementNode = go()
          if (elementNode === null) break
          children.push(elementNode)
          if (elementNode.type === nodeTypeEndBracket) break
        }
        return createNonTerminal(nodeTypeList, i - start, children)
      }
      case 93: {
        i++
        return createTerminal(nodeTypeEndBracket, 1)
      }
      default: {
        const scan = (pred, type) => {
          const start = i
          i++
          while (i < inputBytes.length && pred(inputBytes[i])) i++
          return createTerminal(type, i - start)
        }
        if (isWordChar(c)) return scan(isWordChar, nodeTypeWord)
        if (isWhitespace(c)) return scan(isWhitespace, nodeTypeWhitespace)
        return scan((c) => !isWordChar(c) && !isWhitespace(c) && c !== 91 && c !== 93, nodeTypeIllegalChars)
      }
    }
  }
  const topLevelNodes = []
  while (true) {
    const node = go()
    if (node === null) break
    topLevelNodes.push(node)
  }
  if (i !== inputBytes.length) throw new Error('expected to be at end of input')
  return createNonTerminal(nodeTypeRoot, inputBytes.length, topLevelNodes)
}

const newTreeCursor = (rootNode) => {
  const initialNode = rootNode
  let offset = 0
  const path = []
  const currentNode = () => {
    if (path.length === 0) return initialNode
    const { parentNode, childIndex } = path.at(-1)
    return parentNode.children[childIndex]
  }
  const getPathCopy = () => path.map(({ parentNode, childIndex }) => ({ parentNode, childIndex }))
  return {
    gotoFirstChild: () => {
      const node = currentNode()
      if (node.children === undefined || node.children.length === 0) return false
      path.push({ parentNode: node, childIndex: 0 })
      return true
    },
    gotoLastChild: () => {
      const node = currentNode()
      if (node.children === undefined || node.children.length === 0) return false
      path.push({ parentNode: node, childIndex: node.children.length - 1 })
      offset += node.byteLength - node.children.at(-1).byteLength
      return true
    },
    gotoNextSibling: () => {
      if (path.length === 0) return false
      const cur = path.at(-1)
      const { parentNode, childIndex } = cur
      const { children } = parentNode
      if (childIndex === children.length - 1) return false
      const { byteLength } = children[childIndex]
      cur.childIndex++
      offset += byteLength
      return true
    },
    gotoPrevSibling: () => {
      if (path.length === 0) return false
      const cur = path.at(-1)
      const { parentNode, childIndex } = cur
      if (childIndex === 0) return false
      const { children } = parentNode
      const { byteLength } = children[childIndex - 1]
      cur.childIndex--
      offset -= byteLength
      return true
    },
    gotoParent: () => {
      if (path.length === 0) return false
      const { parentNode, childIndex } = path.pop()
      const parentChildren = parentNode.children
      for (let i = 0; i < childIndex; i++) offset -= parentChildren[i].byteLength
      return true
    },
    getParent: () => {
      if (path.length === 0) return null
      const { parentNode } = path.at(-1)
      return parentNode
    },
    currentNode,
    getOffset: () => offset,
    getPathCopy,
  }
}

const gotoNext = (cursor) => {
  while (true) {
    if (cursor.gotoFirstChild()) return true
    if (cursor.gotoNextSibling()) return true
    while (true) {
      if (!cursor.gotoParent()) return false
      if (cursor.gotoNextSibling()) return true
    }
  }
}

const gotoPrev = (cursor) => {
  while (true) {
    if (cursor.gotoLastChild()) return true
    if (cursor.gotoPrevSibling()) return true
    while (true) {
      if (!cursor.gotoParent()) return false
      if (cursor.gotoPrevSibling()) return true
    }
  }
}

function* preorderGeneratorFromCursor(cursor) {
  while (true) {
    yield cursor.currentNode()
    if (!gotoNext(cursor)) return
  }
}

const getErrors = (tree) => {
  const cursor = newTreeCursor(tree)
  const errors = []
  for (const node of preorderGeneratorFromCursor(cursor)) {
    switch (node.type) {
      case nodeTypeIllegalChars:
        errors.push({ message: 'illegal-characters', node })
        break
      case nodeTypeEndBracket:
        const parent = cursor.getParent()
        if (parent === null) throw new Error('expected parent')
        if (parent.type !== nodeTypeList) errors.push({ message: 'extra-closing', node })
        break
      case nodeTypeList: {
        const { children } = node
        if (children.length === 0) throw new Error('list has no children')
        if (children.at(-1).type !== nodeTypeEndBracket) errors.push({ message: 'unclosed-list', node })
        break
      }
    }
  }
  return errors
}

const searchRanges2 = (tree) => {
  const { root } = tree
  const cursor = newTreeCursor(root)
  const searchRange = (range) => {
    const { rangeOffset, rangeLength, text } = range
    const isContained = () => {
      const offset = cursor.getOffset()
      return offset <= rangeOffset && rangeOffset + rangeLength <= offset + cursor.currentNode().byteLength
    }
    const parsedNode = internalParseDAG(textEncoder.encode(text), tree.db)
    const parsedCursor = newTreeCursor(parsedNode)
    let firstTerminal = null
    for (const node of preorderGeneratorFromCursor(parsedCursor)) {
      if (node.type === nodeTypeRoot || node.type === nodeTypeList) continue
      firstTerminal = node
      break
    }
    if (firstTerminal !== null) console.log({ text, firstTerminal })
    while (true) {
      if (isContained()) {
        if (cursor.gotoFirstChild()) continue
        // contained in a terminal node
        return
      }
      if (cursor.gotoNextSibling()) continue
      while (true) {
        if (!cursor.gotoParent()) throw new Error('expected parent')
        // contained in a non-terminal node
        if (isContained()) return
        if (cursor.gotoNextSibling()) break
      }
    }
  }
  const changesRev = [...tree.changes]
  const results = []
  for (const change of changesRev.reverse()) {
    searchRange(change)
    const { rangeOffset, rangeLength } = change
    const rangeEnd = rangeOffset + rangeLength
    const node = cursor.currentNode()
    const nodeOffset = cursor.getOffset()
    const nodeEnd = nodeOffset + node.byteLength

    const data = {
      change,
      path: cursor.getPathCopy(),
      nodeOffset,
      node,
      distStart: rangeOffset - nodeOffset,
      distEnd: nodeEnd - rangeEnd,
    }
    results.push(data)
  }
  return results
}
const textEncoder = new TextEncoder()

const parse = (inputText, oldTree, oldText) => {
  const inputBytes = textEncoder.encode(inputText)
  let db
  if (oldTree) {
    const searchResult = searchRanges2(oldTree)
    console.dir({ oldText, inputText, searchResult }, { depth: null })
    db = oldTree.db
  } else {
    db = makeDB()
  }
  const root = internalParseDAG(inputBytes, db)
  return { root, db, changes: [] }
}

const okTests = ['', 'abc 123', '[]', '[ ]', '[quote 34]', `[if [eq 4 x] [] x]`, 'we-allow-dashes']
const errorTests = [
  [['illegal-characters'], '234 ILLEGAL but then legal'],
  [['extra-closing'], '[]]'],
  [['unclosed-list'], '[quote 34'],
]

const tests = okTests.map((test) => [[], test]).concat(errorTests)
const textDecoder = new TextDecoder()

const treeToString = (root, bytes) => {
  const cursor = newTreeCursor(root)
  let result = ''
  for (const { byteLength, type } of preorderGeneratorFromCursor(cursor)) {
    if (type === nodeTypeRoot || type === nodeTypeList) continue
    const offset = cursor.getOffset()
    result += textDecoder.decode(bytes.slice(offset, offset + byteLength))
  }
  return result
}

for (const [expectedErrors, test] of tests) {
  const bytes = textEncoder.encode(test)
  const root = internalParseDAG(bytes, makeDB())
  const errors = getErrors(root)
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
  console.log(`'${test}'`)

  console.log(`'${treeToString(root, bytes)}'`)

  // const cursor = newTreeCursor(tree)
  // for (const node of preorderGeneratorFromCursor(cursor)) {
  //   console.log(node)
  // }
}

const deltas = [
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
  // {
  //   oldText: '[if [eq 0 x] [list 1 2 3]]',
  //   changes: [{ rangeOffset: 4, rangeLength: 8, text: 'd' }],
  //   newText: '[if d [list 1 2 3]]',
  // },
  // {
  //   oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
  //   changes: [{ rangeOffset: 11, rangeLength: 5, text: 'inc' }],
  //   newText: '[if [eq 0 [inc x]] [list 1 2 3]]',
  // },
  // {
  //   oldText: '[if [eq 0 [add 1 x]] [list 1 2 3]]',
  //   changes: [{ rangeOffset: 11, rangeLength: 0, text: 'i' }],
  //   newText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
  // },
  // {
  //   oldText: '[if [eq 0 [iadd 1 x]] [list 1 2 3]]',
  //   changes: [{ rangeOffset: 12, rangeLength: 2, text: 'f' }],
  //   newText: '[if [eq 0 [ifd 1 x]] [list 1 2 3]]',
  // },
  // {
  //   oldText: '[if 3 []]\n[if 3 [list 1 2 3]]',
  //   newText: '[if [3] []]\n[if [3] [list 1 2 3]]',
  //   changes: [
  //     { rangeOffset: 15, rangeLength: 0, text: ']' },
  //     { rangeOffset: 14, rangeLength: 0, text: '[' },
  //     { rangeOffset: 5, rangeLength: 0, text: ']' },
  //     { rangeOffset: 4, rangeLength: 0, text: '[' },
  //   ],
  // },
  // {
  //   oldText: 'xy23\nxy23',
  //   newText: 'xyz123\nxyz123',
  //   changes: [
  //     { rangeLength: 0, rangeOffset: 7, text: 'z1' },
  //     { rangeLength: 0, rangeOffset: 2, text: 'z1' },
  //   ],
  // },
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
  let newTextFromChanges = oldText
  for (const { rangeOffset, rangeLength, text } of changes)
    newTextFromChanges =
      newTextFromChanges.slice(0, rangeOffset) + text + newTextFromChanges.slice(rangeOffset + rangeLength)
  return newTextFromChanges
}

for (const delta of deltas) {
  const { oldText, changes, newText } = delta
  assertDesc(changes)
  if (applyChanges(delta) !== newText) {
    console.log({ oldText, changes, newText, newTextFromChanges: applyChanges(delta) })
    throw new Error('expected newTextFromChanges to equal newText')
  }
  const tree = parse(oldText)
  const errors = getErrors(tree.root)
  if (errors.length) {
    console.log(errors)
    throw new Error('expected no errors')
  }
  tree.changes.push(...changes)
  const newTree = parse(newText, tree, oldText)
  const newErrors = getErrors(newTree.root)
  if (newErrors.length) {
    console.log(newErrors)
    throw new Error('expected no errors')
  }
}
