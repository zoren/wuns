const isWhitespace = (c) => c === 32 || c === 9 || c === 10
const otherWordChars = new Set([...'-./='].map((c) => c.charCodeAt(0)))
const isWordChar = (c) => (97 <= c && c <= 122) || (48 <= c && c <= 57) || otherWordChars.has(c)
const isIllegal = (c) => !isWordChar(c) && !isWhitespace(c) && c !== 91 && c !== 93

const nodeTypeRoot = 'root'
const nodeTypeList = 'list'
const nodeTypeStartBracket = '['
const nodeTypeEndBracket = ']'
const nodeTypeWord = 'word'
const nodeTypeWhitespace = 'whitespace'
const nodeTypeIllegalChars = 'illegal-chars'

export const treesEqual = (a, b) => {
  if (a.type !== b.type || a.byteLength !== b.byteLength) return false
  const achil = a.children
  const bchil = b.children
  if (achil === undefined && bchil === undefined) return a.type === b.type || a.byteLength === b.byteLength
  if (achil === undefined || bchil === undefined) return false
  const noChildren = achil.length
  if (noChildren !== bchil.length) return false
  for (let i = 0; i < noChildren; i++) if (!treesEqual(achil[i], bchil[i])) return false
  return true
}

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

const isNonTerminalNodeType = (type) => type === nodeTypeList || type === nodeTypeRoot

export const validateNode = (node) => {
  const { type, byteLength, children } = node
  if (!Object.isFrozen(node)) throw new Error('expected node to be frozen')
  if (byteLength === undefined || byteLength < 0 || !Number.isInteger(byteLength))
    throw new Error('expected positive byte length')
  if (type !== nodeTypeRoot && byteLength === 0) throw new Error('expected non-root node to have non-zero byte')
  if ((type === nodeTypeStartBracket || type === nodeTypeEndBracket) && byteLength !== 1)
    throw new Error('expected start bracket to have byte length 1')
  if (!children) return
  if (type !== nodeTypeList && type !== nodeTypeRoot) throw new Error('expected non-terminal node to have children')
  if (type !== nodeTypeRoot && children.length === 0) throw new Error('expected non-terminal node to have children')
  if (type === nodeTypeList && byteLength === 0) throw new Error('expected list to have non-zero byte length')
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

export const logNode = ({ type, byteLength, children }, indent = '') => {
  console.log(indent + type + ' ' + byteLength)
  if (children) {
    indent += '  '
    for (const child of children) logNode(child, indent)
  }
}

export const newTreeCursor = (rootNode) => {
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

const sumByteLengths = (children) =>
  children.reduce((acc, node) => {
    const { byteLength } = node
    if (!Number.isInteger(byteLength) || byteLength === 0) throw new Error('expected byte length')
    return acc + byteLength
  }, 0)

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
  if (cachedNode) return cachedNode
  cachedNode = Object.freeze({ type, byteLength })
  cached.set(byteLength, cachedNode)
  return cachedNode
}

export const word = (n) => createTerminal(nodeTypeWord, n)
export const wspc = (n) => createTerminal(nodeTypeWhitespace, n)
export const ille = (n) => createTerminal(nodeTypeIllegalChars, n)

export const lsqb = createTerminal(nodeTypeStartBracket, 1)
export const rsqb = createTerminal(nodeTypeEndBracket, 1)

const createNonTerminal = (type, byteLength, children) => {
  if (!isNonTerminalNodeType(type)) throw new Error('expected non-terminal node type')
  if (type !== nodeTypeRoot && children.length === 0) throw new Error('expected non-terminal node to have children')
  for (const { type, byteLength } of children) {
    if (type === nodeTypeRoot) throw new Error('root cannot be child')
    if (!Number.isInteger(byteLength) || byteLength <= 0) throw new Error('expected positive byte length')
  }
  if (sumByteLengths(children) !== byteLength)
    throw new Error('expected sum of child byte lengths to equal byte length')
  return Object.freeze({ type, byteLength, children: Object.freeze(children) })
}

const emptyRoot = createNonTerminal(nodeTypeRoot, 0, [])

export const root = (...nodes) =>
  nodes.length === 0 ? emptyRoot : createNonTerminal(nodeTypeRoot, sumByteLengths(nodes), nodes)
export const list = (...nodes) => createNonTerminal(nodeTypeList, sumByteLengths(nodes), nodes)

// splits a node before not including the index returning a new node containing the split off part
export const nodeTake = (root, initIndex) => {
  if (root.type !== nodeTypeRoot) throw new Error('expected root node')
  if (initIndex < 0) throw new Error('expected index to be non-negative')
  if (initIndex === 0) return emptyRoot
  if (initIndex === root.byteLength) return root

  const go = (node, index) => {
    const { type, byteLength, children } = node
    if (index < 0) throw new Error('expected index to be non-zero')
    if (byteLength <= index) return node
    if (isTerminalNodeType(type)) return createTerminal(type, index)
    const newChildren = []
    let remaining = index
    for (const child of children) {
      const { byteLength } = child
      if (byteLength >= remaining) {
        newChildren.push(go(child, remaining))
        break
      }
      newChildren.push(child)
      remaining -= byteLength
    }
    return createNonTerminal(type, index, newChildren)
  }
  return go(root, initIndex)
}

// drops bytes of a node merging headless lists
export const nodeDropMerge = (root, initIndex) => {
  if (root.type !== nodeTypeRoot) throw new Error('expected root node')
  if (root.byteLength === initIndex) return emptyRoot
  const go = (node, index) => {
    const { type, byteLength, children } = node
    if (index < 0) throw new Error('expected index to be non-negative')
    if (index === 0) return [node]
    if (byteLength < index) throw new Error('expected index to be less than byte length')
    if (isTerminalNodeType(type)) return [createTerminal(type, byteLength - index)]
    const newChildren = []
    let remaining = index
    for (let childIndex = 0; childIndex < children.length; childIndex++) {
      const child = children[childIndex]
      const childLength = child.byteLength
      if (remaining < childLength) {
        newChildren.push(...go(child, remaining))
        newChildren.push(...children.slice(childIndex + 1))
        if (type === nodeTypeList) return newChildren
        return [createNonTerminal(type, byteLength - index, newChildren)]
      }
      remaining -= childLength
    }
    throw new Error('expected to find child to drop')
  }
  return go(root, initIndex)[0]
}

export const mergeNodes = (a, b) => {
  if (a.type !== nodeTypeRoot || b.type !== nodeTypeRoot) throw new Error('expected root nodes')
  const aChildren = a.children
  if (aChildren.length === 0) return b
  if (b.children.length === 0) return a
  const bChildren = [...b.children]
  const spliceUnclosed = () => {
    for (let i = 0; i < bChildren.length; i++)
      if (bChildren[i].type === nodeTypeEndBracket) return bChildren.splice(0, i + 1)
    return bChildren.splice(0, bChildren.length)
  }
  // merge potentially unclosed lists of a with top nodes of b
  // if a has unclosed lists they will the last children of their parent
  const go = (node) => {
    const { type, byteLength, children } = node
    if (type === nodeTypeStartBracket) throw new Error('unexpected start bracket')
    if (type === nodeTypeEndBracket) return node
    if (isVariableLengthTerminalNodeType(type)) {
      if (bChildren.length === 0 || bChildren[0].type !== type) return node
      return createTerminal(type, byteLength + bChildren.shift().byteLength)
    }
    if (type !== nodeTypeList) throw new Error('unexpected type')
    if (children.length === 0) throw new Error('expected list to have children')
    if (children[0].type !== nodeTypeStartBracket) throw new Error('expected list to start with start bracket')
    if (bChildren.length === 0) return node
    if (children.length === 1) {
      const poped = spliceUnclosed()
      const [child] = children
      const merged = [child, ...poped]
      const length = child.byteLength + sumByteLengths(poped)
      return createNonTerminal(nodeTypeList, length, merged)
    }
    const lastChild = children.at(-1)
    if (lastChild.type === nodeTypeEndBracket) return node
    const newLast = go(lastChild)
    const poped = spliceUnclosed()
    const merged = children.slice(0, -1).concat(newLast, poped)
    const length = byteLength - lastChild.byteLength + newLast.byteLength + sumByteLengths(poped)
    return createNonTerminal(nodeTypeList, length, merged)
  }
  const children = aChildren.slice(0, -1).concat(go(aChildren.at(-1)), bChildren)
  return createNonTerminal(nodeTypeRoot, a.byteLength + b.byteLength, children)
}

export const patchNode = (oldTree, changes) => {
  let curOld = oldTree
  let result = emptyRoot
  assertDesc(changes)
  changes.reverse()
  for (const { rangeOffset, rangeLength, text } of changes) {
    const dropped = oldTree.byteLength - curOld.byteLength
    const split = nodeTake(curOld, rangeOffset - dropped)
    const insert = parseString(text)
    const splitInsert = mergeNodes(split, insert)
    result = mergeNodes(result, splitInsert)
    curOld = nodeDropMerge(curOld, rangeOffset + rangeLength - dropped)
  }
  return mergeNodes(result, curOld)
}

const finishNonTerminal = (stack) => {
  if (stack.length === 0) throw new Error('expected stack to be non-empty')
  const node = stack.pop()
  node.byteLength = sumByteLengths(node.children)
  Object.freeze(node.children)
  Object.freeze(node)
  return node
}

const textEncoder = new TextEncoder()

export const parseString = (text) => {
  const root = { type: nodeTypeRoot, byteLength: 0, children: [] }
  const stack = [root]
  const utf8bytes = textEncoder.encode(text)
  const pushTop = (node) => stack.at(-1).children.push(node)
  for (let i = 0; i < utf8bytes.length; i++) {
    const ctokenType = codeToTerminalType(utf8bytes[i])
    switch (ctokenType) {
      case nodeTypeStartBracket: {
        const node = { type: nodeTypeList, byteLength: 1, children: [lsqb] }
        pushTop(node)
        stack.push(node)
        continue
      }
      case nodeTypeEndBracket: {
        pushTop(rsqb)
        if (1 < stack.length) finishNonTerminal(stack)
        continue
      }
    }
    const pred = terminalTypeToPredicate(ctokenType)
    let j = i + 1
    for (; j < utf8bytes.length && pred(utf8bytes[j]); j++);
    pushTop(createTerminal(ctokenType, j - i))
    i = j - 1
  }
  while (stack.length > 0) finishNonTerminal(stack)
  return root
}

const assertDesc = (changes) => {
  // check changes descending by offset
  let offset = null
  for (const { rangeOffset, rangeLength, text } of changes) {
    if (rangeLength === 0 && text.length === 0) throw new Error('expected rangeLength or text to be non-zero')
    if (offset !== null && rangeOffset > offset) throw new Error('expected changes to be sorted by offset')
    offset = rangeOffset
  }
}

function* preorderGeneratorFromCursor(cursor) {
  while (true) {
    yield cursor.currentNode()
    if (cursor.gotoFirstChild()) continue
    if (cursor.gotoNextSibling()) continue
    while (true) {
      if (!cursor.gotoParent()) return
      if (cursor.gotoNextSibling()) break
    }
  }
}

export const getErrors = (tree) => {
  const cursor = newTreeCursor(tree)
  const errors = []
  for (const node of preorderGeneratorFromCursor(cursor)) {
    switch (node.type) {
      case nodeTypeIllegalChars:
        errors.push({ message: 'illegal-characters', node })
        break
      case nodeTypeEndBracket:
        if (cursor.getParent().type !== nodeTypeList) errors.push({ message: 'extra-closing', node })
        break
      case nodeTypeList:
        if (node.children.at(-1).type !== nodeTypeEndBracket) errors.push({ message: 'unclosed-list', node })
        break
    }
  }
  return errors
}
