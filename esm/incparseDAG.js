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

const isVariableLengthTerminalNodeType = (type) =>
  type === nodeTypeWord || type === nodeTypeIllegalChars || type === nodeTypeWhitespace

const isTerminalNodeType = (type) =>
  isVariableLengthTerminalNodeType(type) || type === nodeTypeStartBracket || type === nodeTypeEndBracket

const insertNonTerminalNodeType = (type) => type === nodeTypeList || type === nodeTypeRoot

const validateNode = (node) => {
  const { type, byteLength, children } = node
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

const makeDB = () => {
  const terminalCache = new Map()
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
  return Object.freeze({ createTerminal })
}

const createNonTerminal = (type, byteLength, children) => {
  if (children.reduce((acc, { byteLength }) => acc + byteLength, 0) !== byteLength)
    throw new Error('expected sum of child byte lengths to equal byte length')
  return Object.freeze({ type, byteLength, children: Object.freeze(children) })
}

const internalParseDAG = (inputBytes, { createTerminal }) => {
  let i = 0
  const errors = []
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
          if (elementNode === null) {
            errors.push({ message: 'unclosed-list', start })
            break
          }
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
  const root = createNonTerminal(nodeTypeRoot, inputBytes.length, topLevelNodes)
  validateNode(root)
  return root
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

const patchTreeSearch = (oldTree) => {
  const { root, changes, db } = oldTree
  const { createTerminal } = db
  const cursor = newTreeCursor(root)
  const merge2ChildrenOfSameType = (child1, child2) => {
    const { type } = child1
    if (isVariableLengthTerminalNodeType(type) && type === child2.type)
      return [createTerminal(type, child1.byteLength + child2.byteLength)]
    return [child1, child2]
  }

  const mergeNChildrenOfSameType = (...children) => {
    if (children.length <= 1) return children
    const newChildren = [{ ...children[0] }]
    for (let i = 1; i < children.length; i++) {
      const prev = newChildren.at(-1)
      const next = children[i]
      if (prev.type === next.type)
        newChildren[newChildren.length - 1] = createTerminal(prev.type, prev.byteLength + next.byteLength)
      else newChildren.push(next)
    }
    return newChildren
  }

  const searchRange = (range) => {
    const { rangeOffset, rangeLength } = range
    if (rangeOffset < cursor.getOffset()) throw new Error('expected range to be in order')
    const isContained = () => {
      const offset = cursor.getOffset()
      return offset <= rangeOffset && rangeOffset + rangeLength <= offset + cursor.currentNode().byteLength
    }
    while (true) {
      if (isContained()) {
        if (cursor.gotoFirstChild()) continue
        const node = cursor.currentNode()
        // contained in a terminal node
        if (node.type === nodeTypeList) {
          console.log({ node, range })
          throw new Error('expected terminal')
        }
        if (node.type !== nodeTypeRoot) return 'terminal'
      }
      if (cursor.gotoNextSibling()) continue
      while (true) {
        if (!cursor.gotoParent()) return 'non-terminal'
        // contained in a non-terminal node
        if (!insertNonTerminalNodeType(cursor.currentNode().type)) throw new Error('expected non-terminal')
        if (isContained()) return 'non-terminal'
        if (cursor.gotoNextSibling()) break
      }
    }
  }
  const data = []
  for (const change of [...changes].reverse()) {
    const termOrNot = searchRange(change)
    const path = cursor.getPathCopy()
    const offset = cursor.getOffset()
    const node = cursor.currentNode()
    const { type, children, byteLength } = node
    const { rangeOffset, rangeLength, text } = change
    const distStart = rangeOffset - offset
    const rangeEnd = rangeOffset + rangeLength
    const nodeEnd = offset + byteLength
    const distEnd = nodeEnd - rangeEnd
    if (distStart < 0 || distEnd < 0) throw new Error('expected distStart and distEnd to be non-negative')

    const replaceNode = internalParseDAG(textEncoder.encode(text), db)
    // if replace node has unbalanced brackets, we give up
    const replaceChildren = replaceNode.children

    if (termOrNot === 'terminal') {
      const diff = (() => {
        // we are replacing the node completely
        // what if it's a bracket?
        // if it's a start bracket we need to merge the list elements into the parent
        // if it's an end bracket we just replace it
        if (distStart === 0 && distEnd === 0) return replaceChildren

        // we are replacing the start of the node
        if (distStart === 0)
          return [
            ...replaceChildren.slice(0, -1),
            ...merge2ChildrenOfSameType(replaceChildren.at(-1), createTerminal(type, distEnd)),
          ]
        // we are replacing the end of the node
        if (distEnd === 0)
          return [
            ...merge2ChildrenOfSameType(createTerminal(type, distStart), replaceChildren[0]),
            ...replaceChildren.slice(1),
          ]

        // we are replacing the middle of the node
        const start = merge2ChildrenOfSameType(createTerminal(type, distStart), replaceChildren[0])
        if (start.length === 1) return merge2ChildrenOfSameType(start[0], createTerminal(type, distEnd))
        return [start[0], ...merge2ChildrenOfSameType(start[1], createTerminal(type, distEnd))]
      })()
      const go = (node, path) => {
        const { type, byteLength, children } = node
        if (children === undefined) throw new Error('expected children')
        const { childIndex } = path.shift()
        const before = children.slice(0, childIndex)
        // const replacedChild = children[childIndex]
        const after = children.slice(childIndex + 1)
        if (path.length === 0) {
          const updatedChildren = mergeNChildrenOfSameType(...before, ...diff, ...after)
          const newLength = updatedChildren.reduce((acc, { byteLength }) => acc + byteLength, 0)
          return createNonTerminal(type, newLength, updatedChildren)
        }
        const newNode = go(children[childIndex], path)
        const updatedChildren = mergeNChildrenOfSameType(...before, newNode, ...after)
        const newLength = updatedChildren.reduce((acc, { byteLength }) => acc + byteLength, 0)
        return createNonTerminal(type, newLength, updatedChildren)
      }
      console.log({ change, termOrNot, offset, path: path.map(({ childIndex }) => childIndex), text, diff })
      return go(root, cursor.getPathCopy())
    }
    if (termOrNot !== 'non-terminal') throw new Error('expected non-terminal')
  }
  return null
}

const textEncoder = new TextEncoder()

const assertTreeEq = (a, b) => {
  if (a === b) return
  if (a.type !== b.type) throw new Error('expected types to be equal')
  if (a.byteLength !== b.byteLength) throw new Error('expected byteLength to be equal')
  if (a.children === undefined && b.children === undefined) return
  if (a.children === undefined || b.children === undefined) throw new Error('expected children to be equal')
  if (a.children.length !== b.children.length) throw new Error('expected children length to be equal')
  for (let i = 0; i < a.children.length; i++) assertTreeEq(a.children[i], b.children[i])
}

const parse = (inputText, oldTree, oldText) => {
  const inputBytes = textEncoder.encode(inputText)
  let db
  if (oldTree) {
    const patchedTree = patchTreeSearch(oldTree)
    console.dir({ prev: oldText, next: inputText, patchedTree }, { depth: null })
    if (patchedTree) {
      const reparsed = parse(inputText)
      assertTreeEq(reparsed.root, patchedTree)
      return { root: patchedTree, db, changes: [] }
    }
    console.log('no patch')
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
  for (const { byteLength, children } of preorderGeneratorFromCursor(cursor)) {
    if (children) continue
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
