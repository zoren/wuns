export const treesEqual = (a, b) => {
  if (a.type !== b.type || a.length !== b.length) return false
  const achil = a.children
  const bchil = b.children
  if (achil === undefined && bchil === undefined) return a.type === b.type || a.length === b.length
  if (achil === undefined || bchil === undefined) return false
  const noChildren = achil.length
  if (noChildren !== bchil.length) return false
  for (let i = 0; i < noChildren; i++) if (!treesEqual(achil[i], bchil[i])) return false
  return true
}

export const logNode = ({ type, length, children }, indent = '') => {
  console.log(indent + type + ' ' + length)
  if (children) {
    indent += '  '
    for (const child of children) logNode(child, indent)
  }
}

const sumLengths = (children) =>
  children.reduce((acc, node) => {
    const { length } = node
    if (!Number.isInteger(length) || length === 0) throw new Error('expected byte length')
    return acc + length
  }, 0)

const nodeTypeRoot = 'root'
const nodeTypeList = 'list'
const nodeTypeStartBracket = '['
const nodeTypeEndBracket = ']'
const nodeTypeWord = 'word'
const nodeTypeWhitespace = 'whitespace'
const nodeTypeIllegalChars = 'illegal-chars'

const isVariableLengthTerminalNodeType = (type) =>
  type === nodeTypeWord || type === nodeTypeIllegalChars || type === nodeTypeWhitespace

const isTerminalNodeType = (type) =>
  isVariableLengthTerminalNodeType(type) || type === nodeTypeStartBracket || type === nodeTypeEndBracket

const isNonTerminalNodeType = (type) => type === nodeTypeList || type === nodeTypeRoot

export const validateNode = (node) => {
  const { type, length, children } = node
  if (!Object.isFrozen(node)) throw new Error('expected node to be frozen')
  if (length === undefined || length < 0 || !Number.isInteger(length)) throw new Error('expected positive byte length')
  if (type !== nodeTypeRoot && length === 0) throw new Error('expected non-root node to have non-zero byte')
  if ((type === nodeTypeStartBracket || type === nodeTypeEndBracket) && length !== 1)
    throw new Error('expected start bracket to have byte length 1')
  if (!children) return
  if (type !== nodeTypeList && type !== nodeTypeRoot) throw new Error('expected non-terminal node to have children')
  if (type !== nodeTypeRoot && children.length === 0) throw new Error('expected non-terminal node to have children')
  if (type === nodeTypeList && length === 0) throw new Error('expected list to have non-zero byte length')
  let prevSiblingType = null
  let totallength = 0
  for (const child of children) {
    const { type, length } = child
    if (isVariableLengthTerminalNodeType(type) && prevSiblingType === type)
      throw new Error('var length terminals of same type cannot be adjacent')
    prevSiblingType = type
    validateNode(child)
    totallength += length
  }
  if (totallength !== length) throw new Error('expected sum of child byte lengths to equal byte length')
}

export const getErrors = (root) => {
  if (root.type !== nodeTypeRoot) throw new Error('expected root node')
  const errors = []
  for (const topNode of root.children) {
    if (topNode.type === nodeTypeEndBracket) {
      errors.push({ message: 'extra-closing', node: topNode })
      continue
    }
    const go = (node) => {
      switch (node.type) {
        case nodeTypeIllegalChars:
          errors.push({ message: 'illegal-characters', node })
          break
        case nodeTypeList:
          if (node.children.at(-1).type !== nodeTypeEndBracket) errors.push({ message: 'unclosed-list', node })
          for (const child of node.children) go(child)
          break
      }
    }
    go(topNode)
  }
  return errors
}

const terminalCache = new Map()

const createTerminal = (type, length) => {
  if (!isTerminalNodeType(type)) throw new Error('expected terminal node type')
  if (length <= 0) throw new Error('expected positive byte length')
  if (!isVariableLengthTerminalNodeType(type) && length !== 1) throw new Error('expected byte length to be 1')
  let cached = terminalCache.get(type)
  if (cached === undefined) {
    cached = new Map()
    terminalCache.set(type, cached)
  }
  let cachedNode = cached.get(length)
  if (cachedNode) return cachedNode
  cachedNode = Object.freeze({ type, length })
  cached.set(length, cachedNode)
  return cachedNode
}

export const word = (n) => createTerminal(nodeTypeWord, n)
export const wspc = (n) => createTerminal(nodeTypeWhitespace, n)
export const ille = (n) => createTerminal(nodeTypeIllegalChars, n)

export const lsqb = createTerminal(nodeTypeStartBracket, 1)
export const rsqb = createTerminal(nodeTypeEndBracket, 1)

const createNonTerminal = (type, length, children) => {
  if (!isNonTerminalNodeType(type)) throw new Error('expected non-terminal node type')
  if (type !== nodeTypeRoot && children.length === 0) throw new Error('expected non-terminal node to have children')
  for (const { type, length } of children) {
    if (type === nodeTypeRoot) throw new Error('root cannot be child')
    if (!Number.isInteger(length) || length <= 0) throw new Error('expected positive byte length')
  }
  if (sumLengths(children) !== length) throw new Error('expected sum of child byte lengths to equal byte length')
  return Object.freeze({ type, length, children: Object.freeze(children) })
}

const emptyRoot = createNonTerminal(nodeTypeRoot, 0, [])

export const root = (...nodes) =>
  nodes.length === 0 ? emptyRoot : createNonTerminal(nodeTypeRoot, sumLengths(nodes), nodes)
export const list = (...nodes) => createNonTerminal(nodeTypeList, sumLengths(nodes), nodes)

// splits a node before not including the index returning a new node containing the split off part
export const nodeTake = (root, initIndex) => {
  if (root.type !== nodeTypeRoot) throw new Error('expected root node')
  if (initIndex < 0) throw new Error('expected index to be non-negative')
  if (initIndex === 0) return emptyRoot
  if (initIndex === root.length) return root

  const go = (node, index) => {
    const { type, length, children } = node
    if (index < 0) throw new Error('expected index to be non-zero')
    if (length <= index) return node
    if (isTerminalNodeType(type)) return createTerminal(type, index)
    const newChildren = []
    let remaining = index
    for (const child of children) {
      const { length } = child
      if (remaining <= length) {
        newChildren.push(go(child, remaining))
        break
      }
      newChildren.push(child)
      remaining -= length
    }
    return createNonTerminal(type, index, newChildren)
  }
  return go(root, initIndex)
}

// drops bytes of a node merging headless lists
export const nodeDropMerge = (root, initIndex) => {
  if (root.type !== nodeTypeRoot) throw new Error('expected root node')
  if (root.length === initIndex) return emptyRoot
  const go = (node, index) => {
    const { type, length, children } = node
    if (index < 0) throw new Error('expected index to be non-negative')
    if (index === 0) return [node]
    if (length < index) throw new Error('expected index to be less than byte length')
    if (isTerminalNodeType(type)) return [createTerminal(type, length - index)]
    const newChildren = []
    let remaining = index
    for (let childIndex = 0; childIndex < children.length; childIndex++) {
      const child = children[childIndex]
      const childLength = child.length
      if (remaining < childLength) {
        newChildren.push(...go(child, remaining))
        newChildren.push(...children.slice(childIndex + 1))
        if (type === nodeTypeList) return newChildren
        return [createNonTerminal(type, length - index, newChildren)]
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
    const { type, length, children } = node
    if (type === nodeTypeStartBracket) throw new Error('unexpected start bracket')
    if (type === nodeTypeEndBracket) return node
    if (isVariableLengthTerminalNodeType(type)) {
      if (bChildren.length === 0 || bChildren[0].type !== type) return node
      return createTerminal(type, length + bChildren.shift().length)
    }
    if (type !== nodeTypeList) throw new Error('unexpected type')
    if (children.length === 0) throw new Error('expected list to have children')
    if (children[0].type !== nodeTypeStartBracket) throw new Error('expected list to start with start bracket')
    if (bChildren.length === 0) return node
    if (children.length === 1) {
      const [child] = children
      const poped = spliceUnclosed()
      return createNonTerminal(nodeTypeList, child.length + sumLengths(poped), [child, ...poped])
    }
    const lastChild = children.at(-1)
    if (lastChild.type === nodeTypeEndBracket) return node
    const newLast = go(lastChild)
    const poped = spliceUnclosed()
    return createNonTerminal(
      nodeTypeList,
      length - lastChild.length + newLast.length + sumLengths(poped),
      children.slice(0, -1).concat(newLast, poped),
    )
  }
  const children = aChildren.slice(0, -1).concat(go(aChildren.at(-1)), bChildren)
  return createNonTerminal(nodeTypeRoot, a.length + b.length, children)
}

// space, newline(\n)
const isSpaceOrNewline = (c) => c === 32 || c === 10
// a-z - . / 0-9
const isWordChar = (c) => (97 <= c && c <= 122) || (45 <= c && c <= 57)
const isIllegal = (c) => !isWordChar(c) && !isSpaceOrNewline(c) && c !== 91 && c !== 93

export const parseString = (text) => {
  const stack = [[]]
  const finishList = () => {
    const children = stack.pop()
    stack.at(-1).push(createNonTerminal(nodeTypeList, sumLengths(children), children))
  }
  let i = 0
  while (i < text.length) {
    const start = i
    const c = text.charCodeAt(i++)
    const pushTerm = (pred, type) => {
      while (i < text.length && pred(text.charCodeAt(i))) i++
      stack.at(-1).push(createTerminal(type, i - start))
    }
    switch (c) {
      case 10:
      case 32:
        pushTerm(isSpaceOrNewline, nodeTypeWhitespace)
        continue
      case 91:
        stack.push([lsqb])
        continue
      case 93:
        stack.at(-1).push(rsqb)
        if (1 < stack.length) finishList()
        continue
    }
    if (isWordChar(c)) pushTerm(isWordChar, nodeTypeWord)
    else pushTerm(isIllegal, nodeTypeIllegalChars)
  }
  while (1 < stack.length) finishList()
  const rootChildren = stack.pop()
  return createNonTerminal(nodeTypeRoot, sumLengths(rootChildren), rootChildren)
}

export const patchNode = (oldTree, changes) => {
  {
    // check changes descending by offset
    let offset = null
    for (const { rangeOffset, rangeLength, text } of changes) {
      if (rangeLength === 0 && text.length === 0) throw new Error('expected rangeLength or text to be non-zero')
      if (offset !== null && rangeOffset > offset) throw new Error('expected changes to be sorted by offset')
      offset = rangeOffset
    }
  }
  let curOld = oldTree
  let result = emptyRoot
  changes.reverse()
  for (const { rangeOffset, rangeLength, text } of changes) {
    const dropped = oldTree.length - curOld.length
    const relativeOffset = rangeOffset - dropped
    const split = nodeTake(curOld, relativeOffset)
    const insert = parseString(text)
    const splitInsert = mergeNodes(split, insert)
    result = mergeNodes(result, splitInsert)
    curOld = nodeDropMerge(curOld, relativeOffset + rangeLength)
  }
  return mergeNodes(result, curOld)
}
