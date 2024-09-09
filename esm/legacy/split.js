const term = (length) => {
  if (length <= 0) throw new Error('expected length to be positive')
  return Object.freeze({ length })
}
const nonterm = (...children) => {
  const length = children.reduce((acc, child) => {
    if (child.length === undefined) throw new Error('expected child to have length')
    return acc + child.length
  }, 0)
  return Object.freeze({ length, children })
}
const isTerm = (node) => node.children === undefined
const isNonterm = (node) => node.children !== undefined

const logNode = (node, indent = '') => {
  const { length, children } = node
  console.log(indent + (isNonterm(node) ? 'nt' : 't') + ' ' + length)
  if (children && children.length > 0) {
    const newIndent = indent + '  '
    for (const child of children) logNode(child, newIndent)
  }
}

const nodesEq = (a, b) => {
  if (a === b) return true
  if (isTerm(a) !== isTerm(b)) return false
  if (a.children && b.children) {
    if (a.children.length !== b.children.length) return false
    for (let i = 0; i < a.children.length; i++) {
      if (!nodesEq(a.children[i], b.children[i])) return false
    }
    return a.length === b.length
  }
  return a.length === b.length
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
      offset += node.length - node.children.at(-1).length
      return true
    },
    gotoNextSibling: () => {
      if (path.length === 0) return false
      const cur = path.at(-1)
      const { parentNode, childIndex } = cur
      const { children } = parentNode
      if (childIndex === children.length - 1) return false
      const { length } = children[childIndex]
      cur.childIndex++
      offset += length
      return true
    },
    gotoPrevSibling: () => {
      if (path.length === 0) return false
      const cur = path.at(-1)
      const { parentNode, childIndex } = cur
      if (childIndex === 0) return false
      const { children } = parentNode
      const { length } = children[childIndex - 1]
      cur.childIndex--
      offset -= length
      return true
    },
    gotoParent: () => {
      if (path.length === 0) return false
      const { parentNode, childIndex } = path.pop()
      const parentChildren = parentNode.children
      for (let i = 0; i < childIndex; i++) offset -= parentChildren[i].length
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

const updateStackLengths = (stack) => {
  for (let i = stack.length - 1; i >= 0; i--) {
    const node = stack[i]
    const { children } = node
    if (!children) throw new Error('expected nonterm node')
    node.length = children.reduce((acc, { length }) => {
      if (!length) throw new Error('expected child to have length')
      return acc + length
    }, 0)
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

function* preorderGeneratorFromCursor(cursor) {
  while (true) {
    yield cursor.currentNode()
    if (!gotoNext(cursor)) return
  }
}

// advance cursor to next terminal containing the index
const advanceCursorToIndexN = (
  cursor,
  index,
  { wentNextSibling = () => {}, wentToParent = () => {}, wentToFirstChild = () => {} } = {},
) => {
  while (true) {
    const offset = cursor.getOffset()
    if (index < offset) throw new Error('index before offset')
    const node = cursor.currentNode()
    if (offset + node.length <= index) {
      if (cursor.gotoNextSibling()) {
        wentNextSibling(node)
        continue
      }
      if (!cursor.gotoParent()) {
        return
      }
      wentToParent()
      continue
    }
    if (!cursor.gotoFirstChild()) break
    wentToFirstChild()
  }
}

{
  const tests = [
    {
      tree: nonterm(term(3), nonterm(term(2), term(1))),
      asserts: [
        { path: [0], index: 0 },
        { path: [0], index: 1 },
        { path: [0], index: 2 },
        { path: [1, 0], index: 3 },
        { path: [1, 0], index: 4 },
        { path: [1, 1], index: 5 },
      ],
    },
    {
      tree: nonterm(nonterm(term(1), term(2)), nonterm(term(2), term(1))),
      asserts: [
        { path: [0, 0], index: 0 },
        { path: [0, 1], index: 1 },
        { path: [0, 1], index: 2 },
        { path: [1, 0], index: 3 },
        { path: [1, 0], index: 4 },
        { path: [1, 1], index: 5 },
      ],
    },
    {
      tree: nonterm(term(1)),
      asserts: [{ path: [0], index: 0 }],
    },
  ]
  for (const { tree, asserts } of tests) {
    for (const { path, index } of asserts) {
      const cursor = newTreeCursor(tree)
      advanceCursorToIndexN(cursor, index)
      const actualPath = cursor.getPathCopy().map(({ childIndex }) => childIndex)
      if (actualPath.every((n, i) => n === path[i])) continue
      console.dir({ path, actualPath, index }, { depth: null })
      throw new Error('expected path')
    }
  }
}

const updateNonTermLengths = (node) => {
  if (!isNonterm(node)) return
  node.length = node.children.reduce((acc, child) => acc + child.length, 0)
  for (const child of node.children) updateNonTermLengths(child)
}

const takeN = (root, n) => {
  if (n === root.length) return root
  const stack = [[]]
  const pushTop = (node) => {
    stack.at(-1).push(node)
  }
  const eventHandler = {
    wentNextSibling: (node) => {
      pushTop(node)
    },
    wentToParent: () => {
      stack.pop()
    },
    wentToFirstChild: () => {
      const children = []
      const newNode = { children }
      pushTop(newNode)
      stack.push(children)
    },
  }
  const cursor = newTreeCursor(root)
  advanceCursorToIndexN(cursor, n, eventHandler)
  const cutLength = n - cursor.getOffset()
  if (cutLength > 0) pushTop(term(cutLength))
  const rootMut = stack[0][0]
  updateNonTermLengths(rootMut)
  return rootMut
}

const testsTake = [
  { expected: nonterm(), node: nonterm(), needle: 0 },

  { expected: nonterm(), node: nonterm(term(1)), needle: 0 },
  { expected: nonterm(term(1)), node: nonterm(term(1)), needle: 1 },
  { expected: nonterm(term(1)), node: nonterm(term(1),term(1)), needle: 1 },
  { expected: nonterm(term(2), term(1)), node: nonterm(term(2), term(1),term(2)), needle: 3 },

  { expected: nonterm(), node: nonterm(term(3)), needle: 0 },
  { expected: nonterm(term(3)), node: nonterm(term(3)), needle: 3 },
  { expected: nonterm(term(1)), node: nonterm(term(3)), needle: 1 },
  { expected: nonterm(term(2)), node: nonterm(term(3)), needle: 2 },

  { expected: nonterm(term(1)), node: nonterm(term(2)), needle: 1 },
  { expected: nonterm(term(2)), node: nonterm(term(2), term(3)), needle: 2 },
  { expected: nonterm(term(1)), node: nonterm(term(2), term(3)), needle: 1 },

  { expected: nonterm(), node: nonterm(term(5), term(3)), needle: 0 },
  { expected: nonterm(term(1)), node: nonterm(term(5), term(3)), needle: 1 },
  { expected: nonterm(term(2)), node: nonterm(term(5), term(3)), needle: 2 },
  { expected: nonterm(term(3)), node: nonterm(term(5), term(3)), needle: 3 },
  { expected: nonterm(term(4)), node: nonterm(term(5), term(3)), needle: 4 },
  { expected: nonterm(term(5)), node: nonterm(term(5), term(3)), needle: 5 },
  { expected: nonterm(term(5), term(1)), node: nonterm(term(5), term(3)), needle: 6 },
  { expected: nonterm(term(5), term(2)), node: nonterm(term(5), term(3)), needle: 7 },
  { expected: nonterm(term(5), term(3)), node: nonterm(term(5), term(3)), needle: 8 },
]

for (const { expected, node, needle } of testsTake) {
  const actual = takeN(node, needle)
  if (!nodesEq(expected, actual)) {
    console.dir({ node, needle, expected, actual }, { depth: null })
    throw new Error('expected !== actual')
  }
}

const olddropN = (root, n) => {
  if (n < 0) throw new Error('needle out of bounds')
  if (n > root.length) throw new Error('needle out of bounds')
  if (!isNonterm(root)) throw new Error('expected nonterm root')
  const stack = [{ children: [] }]
  const pushTop = (node) => {
    stack.at(-1).children.push(node)
  }
  const cursor = newTreeCursor(root)
  cursor.gotoFirstChild()
  // scan siblings until we find the node that contains the needle
  // while (true) {

  // }
  // set lengths of the new nodes on the stack and freeze them
  updateStackLengths(stack)
  return stack[0]
}

const dropN = (root, n) => {
  if (n === 0) return root
  const stack = [[]]
  const pushTop = (node) => {
    stack.at(-1).push(node)
  }
  const eventHandler = {
    wentNextSibling: (node) => {
      pushTop(node)
    },
    wentToParent: () => {
      stack.pop()
    },
    wentToFirstChild: () => {
      const children = []
      const newNode = { children }
      pushTop(newNode)
      stack.push(children)
    },
  }
  const cursor = newTreeCursor(root)
  advanceCursorToIndexN(cursor, n)
  advanceCursorToIndexN(cursor, root.length, eventHandler)
  const cutLength = cursor.getOffset() - n
  if (cutLength > 0) pushTop(term(cutLength))
  console.dir({ stack }, { depth: null })
  const rootMut = stack[0]
  updateNonTermLengths(rootMut)
  return rootMut
}


const testsDrop = [
  { expected: nonterm(), node: nonterm(), n: 0 },

  { expected: nonterm(term(1)), node: nonterm(term(1)), n: 0 },
  // { expected: nonterm(), node: nonterm(term(1)), n: 1 },

  // { expected: nonterm(term(3)), node: nonterm(term(3)), n: 0 },
  { expected: nonterm(term(2)), node: nonterm(term(3)), n: 1 },
  { expected: nonterm(term(1)), node: nonterm(term(3)), n: 2 },
  { expected: nonterm(), node: nonterm(term(3)), n: 3 },

  { expected: nonterm(term(1)), node: nonterm(term(2)), n: 1 },
  { expected: nonterm(term(3)), node: nonterm(term(2), term(3)), n: 2 },
  { expected: nonterm(term(1), term(3)), node: nonterm(term(2), term(3)), n: 1 },

  { expected: nonterm(term(5), term(3)), node: nonterm(term(5), term(3)), n: 0 },
  { expected: nonterm(term(4), term(3)), node: nonterm(term(5), term(3)), n: 1 },
  { expected: nonterm(term(3), term(3)), node: nonterm(term(5), term(3)), n: 2 },
  { expected: nonterm(term(2), term(3)), node: nonterm(term(5), term(3)), n: 3 },
  { expected: nonterm(term(1), term(3)), node: nonterm(term(5), term(3)), n: 4 },
  { expected: nonterm(term(3)), node: nonterm(term(5), term(3)), n: 5 },
  { expected: nonterm(term(2)), node: nonterm(term(5), term(3)), n: 6 },
  { expected: nonterm(term(1)), node: nonterm(term(5), term(3)), n: 7 },
  { expected: nonterm(), node: nonterm(term(5), term(3)), n: 8 },
]

// for (const { expected, node, n } of testsDrop) {
//   const actual = dropN(node, n)
//   if (!nodesEq(expected, actual)) {
//     console.dir({ node, n, expected, actual }, { depth: null })
//     throw new Error('expected !== actual')
//   } else {
//     console.dir({ expected, node, n }, { depth: null })
//   }
// }
