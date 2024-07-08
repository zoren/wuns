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

const splitBeforeCursor = (root, needle) => {
  if (needle < 0) throw new Error('needle out of bounds')
  if (needle > root.length) throw new Error('needle out of bounds')
  if (!isNonterm(root)) throw new Error('expected nonterm root')
  const stack = [{ children: [] }]
  const pushTop = (node) => {
    stack.at(-1).children.push(node)
  }
  const cursor = newTreeCursor(root)
  cursor.gotoFirstChild()
  // scan siblings until we find the node that contains the needle
  while (true) {
    {
      const offset = cursor.getOffset()
      if (needle < offset) throw new Error('unexpected offset')
      // the needle is just before the current node so we're done
      if (needle === offset) break
      const node = cursor.currentNode()
      const nodeEnd = offset + node.length
      if (nodeEnd < needle) {
        pushTop(node)
        if (!cursor.gotoNextSibling()) throw new Error('unexpected offset')
        continue
      }
    }
    // the needle is inside the current node
    if (!cursor.gotoFirstChild()) {
      // the current node is a term node and we need to cut it
      pushTop(term(needle - cursor.getOffset()))
      break
    }
    {
      // the current node is a nonterm node, we push a new nonterm node to the stack
      const newNode = { children: [] }
      pushTop(newNode)
      stack.push(newNode)
    }
  }
  // set lengths of the new nodes on the stack and freeze them
  for (let i = stack.length - 1; i >= 0; i--) {
    const node = stack[i]
    const { children } = node
    if (!children) continue
    node.length = children.reduce((acc, child) => acc + child.length, 0)
    Object.freeze(node)
  }
  return stack[0]
}

const testsBefore = [
  { expected: nonterm(), node: nonterm(), needle: 0 },

  { expected: nonterm(), node: nonterm(term(1)), needle: 0 },
  { expected: nonterm(term(1)), node: nonterm(term(1)), needle: 1 },

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

for (const { expected, node, needle } of testsBefore) {
  // console.log()
  // console.log()
  const actual = splitBeforeCursor(node, needle)
  // logNode(expected)
  // logNode(actual)

  if (!nodesEq(expected, actual)) {
    console.dir({ node, needle, expected, actual }, { depth: null })
    throw new Error('expected !== actual')
  }
}

const splitAfter = (root, needle) => {
  let offset = 0
  const go = (node) => {
    if (needle === offset) return node
    const { length, children } = node
    if (!children) {
      const cutLength = offset + length - needle
      offset += length - cutLength
      return term(cutLength)
    }
    const newChildren = []
    let i = 0
    for (; i < children.length; i++) {
      const child = children[i]
      const childEnd = offset + child.length
      if (childEnd > needle) {
        newChildren.push(go(child))
        break
      }
      offset = childEnd
    }
    newChildren.push(...children.slice(i + 1))
    return nonterm(...newChildren)
  }
  return go(root)
}

const testsAfter = [
  { expected: nonterm(), node: nonterm(), needle: 0 },

  { expected: nonterm(term(1)), node: nonterm(term(1)), needle: 0 },
  { expected: nonterm(), node: nonterm(term(1)), needle: 1 },

  { expected: nonterm(term(3)), node: nonterm(term(3)), needle: 0 },
  { expected: nonterm(term(2)), node: nonterm(term(3)), needle: 1 },
  { expected: nonterm(term(1)), node: nonterm(term(3)), needle: 2 },
  { expected: nonterm(), node: nonterm(term(3)), needle: 3 },

  { expected: nonterm(term(1)), node: nonterm(term(2)), needle: 1 },
  { expected: nonterm(term(3)), node: nonterm(term(2), term(3)), needle: 2 },
  { expected: nonterm(term(1), term(3)), node: nonterm(term(2), term(3)), needle: 1 },

  { expected: nonterm(term(5), term(3)), node: nonterm(term(5), term(3)), needle: 0 },
  { expected: nonterm(term(4), term(3)), node: nonterm(term(5), term(3)), needle: 1 },
  { expected: nonterm(term(3), term(3)), node: nonterm(term(5), term(3)), needle: 2 },
  { expected: nonterm(term(2), term(3)), node: nonterm(term(5), term(3)), needle: 3 },
  { expected: nonterm(term(1), term(3)), node: nonterm(term(5), term(3)), needle: 4 },
  { expected: nonterm(term(3)), node: nonterm(term(5), term(3)), needle: 5 },
  { expected: nonterm(term(2)), node: nonterm(term(5), term(3)), needle: 6 },
  { expected: nonterm(term(1)), node: nonterm(term(5), term(3)), needle: 7 },
  { expected: nonterm(), node: nonterm(term(5), term(3)), needle: 8 },
]

for (const { expected, node, needle } of testsAfter) {
  const actual = splitAfter(node, needle)
  const expectedJSON = JSON.stringify(expected)
  const actualJSON = JSON.stringify(actual)
  if (expectedJSON !== actualJSON) {
    console.dir({ expected, actual, node, needle }, { depth: null })
    throw new Error('expected !== actual')
  }
}
