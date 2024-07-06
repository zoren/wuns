const isWhitespace = (c) => c === 32 || c === 9 || c === 10
const otherWordChars = new Set([...'.=/-'].map((c) => c.charCodeAt(0)))
const isWordChar = (c) => (97 <= c && c <= 122) || (48 <= c && c <= 57) || otherWordChars.has(c)
const isIllegal = (c) => !isWordChar(c) && !isWhitespace(c) && c !== 91 && c !== 93

const nodeTypeList = 'list'
const nodeTypeRoot = 'root'
const nodeTypeStartBracket = '['
const nodeTypeEndBracket = ']'
const nodeTypeWord = 'word'
const nodeTypeWhitespace = 'whitespace'
const nodeTypeIllegalChars = 'illegal-chars'

const terminalTypeToPredicate = (type) => {
  switch (type) {
    case nodeTypeWord:
      return isWordChar
    case nodeTypeWhitespace:
      return isWhitespace
    case nodeTypeIllegalChars:
      return isIllegal
  }
  throw new Error('unexpected terminal type')
}

const codeToTerminalType = (c) => {
  switch (c) {
    case 91:
      return nodeTypeStartBracket
    case 93:
      return nodeTypeEndBracket
    default:
      if (isWordChar(c)) return nodeTypeWord
      if (isWhitespace(c)) return nodeTypeWhitespace
      if (isIllegal(c)) return nodeTypeIllegalChars
      throw new Error('unexpected character')
  }
}

const isVariableLengthTerminalNodeType = (type) =>
  type === nodeTypeWord || type === nodeTypeIllegalChars || type === nodeTypeWhitespace

const isTerminalNodeType = (type) =>
  isVariableLengthTerminalNodeType(type) || type === nodeTypeStartBracket || type === nodeTypeEndBracket

const insertNonTerminalNodeType = (type) => type === nodeTypeList || type === nodeTypeRoot

const validateNode = (node) => {
  const { type, byteLength, children } = node
  if (!Object.isFrozen(node)) throw new Error('expected node to be frozen')
  if (byteLength === undefined || byteLength < 0) throw new Error('expected positive byte length')
  if (type !== nodeTypeRoot && byteLength === 0) throw new Error('expected non-root node to have non-zero byte')
  if ((type === nodeTypeStartBracket || type === nodeTypeEndBracket) && byteLength !== 1)
    throw new Error('expected start bracket to have byte length 1')
  if (!children) return
  if (type !== nodeTypeList && type !== nodeTypeRoot) throw new Error('expected non-terminal node to have children')
  if (type !== nodeTypeRoot && children.length === 0) throw new Error('expected non-terminal node to have children')

  let prevSiblingType = null
  let totalByteLength = 0
  for (const child of children) {
    const { type, byteLength } = child
    if (isVariableLengthTerminalNodeType(type) && prevSiblingType === type)
      throw new Error('var length terminals of same type cannot be adjacent')
    prevSiblingType = type
    validateNode(child)
    totalByteLength += byteLength
  }
  if (totalByteLength !== byteLength) throw new Error('expected sum of child byte lengths to equal byte length')
}

const logNode = ({ type, byteLength, children }, depth = 0) => {
  const indent = '  '.repeat(depth)
  console.log(indent + type + ' ' + byteLength)
  if (children) for (const child of children) logNode(child, depth + 1)
}

const makeDB = () => {
  const terminalCache = new Map()
  const createTerminal = (type, byteLength) => {
    if (!isTerminalNodeType(type)) throw new Error('expected terminal node type')
    if (byteLength <= 0) throw new Error('expected positive byte length')
    if (!isVariableLengthTerminalNodeType(type) && byteLength !== 1) throw new Error('expected byte length to be 1')
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
  return Object.freeze({ createTerminal })
}

const sumByteLengths = (children) => children.reduce((acc, { byteLength }) => acc + byteLength, 0)

const createNonTerminal = (type, byteLength, children) => {
  if (type !== nodeTypeRoot && children.length === 0) throw new Error('expected non-terminal node to have children')
  if (sumByteLengths(children) !== byteLength)
    throw new Error('expected sum of child byte lengths to equal byte length')
  return Object.freeze({ type, byteLength, children: Object.freeze(children) })
}

const freezeNode = (node) => {
  if (node.children) Object.freeze(node.children)
  Object.freeze(node)
}

const textEncoder = new TextEncoder()

const incrementalParseDAG = (oldTree) => {
  const db = oldTree ? oldTree.db : makeDB()
  const { createTerminal } = db
  const rootMutable = { type: nodeTypeRoot, byteLength: 0, children: [] }
  // stack needs mutable nodes
  const stack = [rootMutable]
  const pushTop = (node) => {
    const { byteLength } = node
    for (const s of stack) s.byteLength += byteLength
    stack.at(-1).children.push(node)
  }
  const pushMergeChild = (newChild) => {
    const { children } = stack.at(-1)
    const newChildByteLength = newChild.byteLength
    for (const s of stack) s.byteLength += newChildByteLength
    if (children.length === 0) return children.push(newChild)
    const { type, byteLength } = children.at(-1)
    const canMerge = isVariableLengthTerminalNodeType(type) && type === newChild.type
    if (!canMerge) return children.push(newChild)
    children.pop()
    children.push(createTerminal(type, byteLength + newChild.byteLength))
  }
  const parseBuffer = (changeBytes) => {
    let i = 0
    for (; i < changeBytes.length; i++) {
      const ctokenType = codeToTerminalType(changeBytes[i])
      switch (ctokenType) {
        case nodeTypeStartBracket: {
          const node = { type: nodeTypeList, byteLength: 0, children: [] }
          pushTop(node)
          stack.push(node)
          pushTop(createTerminal(nodeTypeStartBracket, 1))
          continue
        }
        case nodeTypeEndBracket: {
          pushTop(createTerminal(nodeTypeEndBracket, 1))
          if (stack.length !== 1) freezeNode(stack.pop())
          continue
        }
      }
      const pred = terminalTypeToPredicate(ctokenType)
      const start = i
      while (i < changeBytes.length) {
        if (pred(changeBytes[i + 1])) {
          i++
        } else break
      }
      pushMergeChild(createTerminal(ctokenType, i - start + 1))
    }
    if (i !== changeBytes.length) throw new Error('expected to be at end of input: ' + i + ' ' + inputBytes.length)
  }
  const { root, changes } = oldTree
  const changeBuffers = changes.map(({ rangeOffset, rangeLength, text }) => ({
    rangeOffset,
    rangeLength,
    changeBytes: textEncoder.encode(text),
    bufOffset: 0,
  }))
  changeBuffers.reverse()
  let offset = 0

  for (const { rangeOffset, rangeLength, changeBytes } of changeBuffers) {
    const splitBefore = (node) => {
      if (rangeOffset === offset) return
      const { type, children } = node
      if (!children) {
        pushMergeChild(createTerminal(type, rangeOffset - offset))
        offset = rangeOffset
        return
      }
      for (let i = 0; i < children.length; i++) {
        if (rangeOffset === offset) return
        const child = children[i]
        const childEnd = offset + child.byteLength
        if (childEnd >= rangeOffset) {
          if (child.type === nodeTypeList) {
            const node = { type: nodeTypeList, byteLength: 0, children: [] }
            pushTop(node)
            stack.push(node)
          }
          splitBefore(child)
          break
        }
        offset = childEnd
        pushTop(child)
      }
    }
    splitBefore(root)
    parseBuffer(changeBytes)
    const rangeEnd = rangeOffset + rangeLength
    offset = 0
    const splitAfter = (node) => {
      const { type, byteLength, children } = node
      if (!children) {
        pushMergeChild(createTerminal(type, offset + byteLength - rangeEnd))
        offset = rangeEnd
        return
      }
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        const childEnd = offset + child.byteLength
        if (childEnd > rangeEnd) {
          splitAfter(child)
          if (child.type === nodeTypeList && stack.length !== 1) freezeNode(stack.pop())
          for (let j = i + 1; j < children.length; j++) pushTop(children[j])
          return
        }
        offset = childEnd
      }
    }
    splitAfter(root)
  }
  for (const node of stack) freezeNode(node)
  validateNode(rootMutable)
  return rootMutable
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

const getErrors = (root) => {
  const cursor = newTreeCursor(root)
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

const assertTreeEq = (a, b) => {
  if (a === b) return
  if (a.type !== b.type) throw new Error('expected types to be equal')
  if (a.byteLength !== b.byteLength) throw new Error('expected byteLength to be equal')
  if (a.children === undefined && b.children === undefined) return
  if (a.children === undefined || b.children === undefined) throw new Error('expected children to be equal')
  if (a.children.length !== b.children.length) {
    console.dir(a.children, { depth: null })
    console.dir(b.children, { depth: null })
    throw new Error('expected children length to be equal')
  }
  for (let i = 0; i < a.children.length; i++) assertTreeEq(a.children[i], b.children[i])
}

const okTests = ['', 'abc 123', 'we-allow-dashes', '[]', '[ ]', '[quote 34]', `[if [eq 4 x] [] x]`]
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
  for (const { byteLength, children } of preorderGeneratorFromCursor(cursor)) {
    if (children) continue
    const offset = cursor.getOffset()
    result += textDecoder.decode(bytes.slice(offset, offset + byteLength))
  }
  return result
}

const parseTextDummy = (text, db) =>
  incrementalParseDAG({
    root: createNonTerminal(nodeTypeRoot, 0, []),
    changes: [{ rangeOffset: 0, rangeLength: 0, text }],
    db,
  })

for (const [expectedErrors, test] of tests) {
  const bytes = textEncoder.encode(test)
  const root = parseTextDummy(test, makeDB())
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
}

const parse = (inputText, oldTree) => {
  let db
  if (oldTree) return { root: incrementalParseDAG(oldTree), db, changes: [] }
  db = makeDB()
  return { root: parseTextDummy(inputText, db), db, changes: [] }
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
    oldText: '[list 1]',
    changes: [{ rangeOffset: 0, rangeLength: 1, text: '' }],
    newText: 'list 1]',
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
  // {
  //   oldText: 'long-identifier-name',
  //   changes: [
  //     { rangeOffset: 15, rangeLength: 1, text: 'x' },
  //     { rangeOffset: 4, rangeLength: 1, text: 'x' },
  //   ],
  //   newText: 'longxidentifierxname',
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
  tree.changes.push(...changes)
  const patchedTree = parse(newText, tree)
  const reparsed = parse(newText)
  assertTreeEq(patchedTree.root, reparsed.root)
}
