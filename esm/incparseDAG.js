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

const validateNode = (node) => {
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

const advanceCursorToIndexN = (
  cursor,
  index,
  { wentNextSibling = () => {}, wentToParent = () => {}, wentToFirstChild = () => {} } = {},
) => {
  while (true) {
    const offset = cursor.getOffset()
    if (index < offset) throw new Error('index before offset')
    const node = cursor.currentNode()
    if (offset + node.byteLength <= index) {
      if (cursor.gotoNextSibling()) {
        wentNextSibling(node)
        continue
      }
      if (!cursor.gotoParent()) return { done: true }
      wentToParent()
      continue
    }
    if (!cursor.gotoFirstChild()) return { done: true, offset }
    wentToFirstChild()
  }
}

const pushTop = (stack, node) => {
  const { type } = node
  if (type === nodeTypeRoot) throw new Error('root cannot be pushed')
  const top = stack.at(-1)
  if (type === nodeTypeStartBracket && top.type !== nodeTypeList) throw new Error('start brackets can only be in lists')
  top.children.push(node)
}

const sumByteLengths = (children) =>
  children.reduce((acc, node) => {
    const { byteLength } = node
    if (!node.byteLength) {
      console.log({ node })
      throw new Error('expected byte length')
    }
    return acc + byteLength
  }, 0)

const finishNonTerminal = (stack) => {
  const node = stack.pop()
  node.byteLength = sumByteLengths(node.children)
  Object.freeze(node.children)
  Object.freeze(node)
}

const finishStack = (stack) => {
  while (stack.length > 0) finishNonTerminal(stack)
}

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

const parseBuffer = (stack, uft8bytes) => {
  let i = 0
  for (; i < uft8bytes.length; i++) {
    const ctokenType = codeToTerminalType(uft8bytes[i])
    switch (ctokenType) {
      case nodeTypeStartBracket: {
        const node = { type: nodeTypeList, byteLength: 0, children: [] }
        pushTop(stack, node)
        stack.push(node)
        pushTop(stack, createTerminal(nodeTypeStartBracket, 1))
        continue
      }
      case nodeTypeEndBracket: {
        pushTop(stack, createTerminal(nodeTypeEndBracket, 1))
        if (stack.length !== 1) finishNonTerminal(stack)
        continue
      }
    }
    const pred = terminalTypeToPredicate(ctokenType)
    const start = i
    while (i + 1 < uft8bytes.length) {
      if (!pred(uft8bytes[i + 1])) break
      i++
    }
    const length = i - start + 1
    const top = stack.at(-1)
    const { children } = top
    const lastChild = children.at(-1)
    if (lastChild && lastChild.type === ctokenType) {
      children[children.length - 1] = createTerminal(ctokenType, lastChild.byteLength + length)
    } else {
      children.push(createTerminal(ctokenType, length))
    }
  }
}

const textEncoder = new TextEncoder()

export const parseString = (text) => {
  const rootMut = { type: nodeTypeRoot, byteLength: 0, children: [] }
  const stack = [rootMut]
  parseBuffer(stack, textEncoder.encode(text))
  finishStack(stack)
  validateNode(rootMut)
  return rootMut
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
        // console.log('getErrors nodeTypeList', { node, end: node.children.at(-1) })
        if (node.children.at(-1).type !== nodeTypeEndBracket) errors.push({ message: 'unclosed-list', node })
        break
    }
  }
  return errors
}
