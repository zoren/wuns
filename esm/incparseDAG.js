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

const internalParseDAG = (inputBytes) => {
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
  const createNonTerminal = (type, byteLength, children) =>
    Object.freeze({ type, byteLength, children: Object.freeze(children) })
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
  return {
    gotoFirstChild: () => {
      const node = currentNode()
      if (node.children === undefined || node.children.length === 0) return false
      path.push({ parentNode: node, childIndex: 0 })
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
    getPathCopy: () => [...path],
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
  const cursor = newTreeCursor(tree)
  const searchRange = ({ rangeOffset, rangeLength }) => {
    while (true) {
      const offset = cursor.getOffset()
      const nodeEnd = offset + cursor.currentNode().byteLength
      const rangeIsContainedInNode = offset <= rangeOffset && rangeOffset + rangeLength <= nodeEnd
      if (rangeIsContainedInNode) {
        const path = cursor.getPathCopy()
        if (cursor.gotoFirstChild()) continue
        console.log('terminal containing range', path)
        return
      }
      if (cursor.gotoNextSibling()) continue
      while (true) {
        if (!cursor.gotoParent()) {
          console.log('range not found', { rangeOffset, rangeLength })
          return
        }
        const offset = cursor.getOffset()
        const rangeIsContainedInNode =
          offset <= rangeOffset && rangeOffset + rangeLength <= offset + cursor.currentNode().byteLength
        if (rangeIsContainedInNode) {
          console.log('non-terminal containing range')
          return
        }
        if (cursor.gotoNextSibling()) break
      }
    }
  }
  const rangeWorkList = [...tree.changes]
  for (const range of rangeWorkList.reverse()) {
    searchRange(range)
  }
}
