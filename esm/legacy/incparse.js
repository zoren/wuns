const isWhitespace = (c) => c === 32 || c === 9 || c === 10
const otherWordChars = new Set([...'.=/-'].map((c) => c.charCodeAt(0)))
const isWordChar = (c) => (97 <= c && c <= 122) || (48 <= c && c <= 57) || otherWordChars.has(c)
// nodes have
// type: word, whitespace, list, illegal-chars, extra-]
// byteLength: number of bytes in a terminal node, could be the aggregated sum of children for non-terminal nodes

const makeDB = () => {
  return { nodes: [], parentToChildren: new Map() }
}
const emptyEdgeList = Object.freeze([])
const getChildrenIds = (db, parentId) => db.parentToChildren.get(parentId) || emptyEdgeList
const getNodeById = (db, nodeId) => {
  if (nodeId < 0 || nodeId >= db.nodes.length) throw new Error('nodeId out of bounds')
  const v = db.nodes[nodeId]
  if (v === undefined) throw new Error('node not found: ' + nodeId)
  return v
}

const getNodeTypeById = (db, nodeId) => getNodeById(db, nodeId).type
const getByteLengthById = (db, nodeId) => getNodeById(db, nodeId).byteLength

export const getTotalNumberOfNodes = (db) => db.nodes.length
export const calcTotalNumberOfEdges = (db) => {
  let count = 0
  for (const [, childIds] of db.parentToChildren) count += childIds.length
  return count
}

const nodeTypeList = 'list'
const nodeTypeRoot = 'root'
const nodeTypeStartBracket = '['
const nodeTypeEndBracket = ']'
const nodeTypeWord = 'word'
const nodeTypeWhitespace = 'whitespace'
const nodeTypeIllegalChars = 'illegal-chars'

const internalParseDB = (inputBytes, db) => {
  const { nodes } = db
  const insertNode = (node) => {
    const id = nodes.length
    nodes.push(node)
    return id
  }
  const terminalCache = new Map()
  const insertTerminal = (type, byteLength) => {
    let cached = terminalCache.get(type)
    if (cached === undefined) {
      cached = new Map()
      terminalCache.set(type, cached)
    }
    let cachedNodeId = cached.get(byteLength)
    if (cachedNodeId === undefined) {
      cachedNodeId = insertNode(Object.freeze({ type, byteLength }))
      cached.set(byteLength, cachedNodeId)
    }
    return cachedNodeId
  }
  let i = 0
  const go = () => {
    if (i >= inputBytes.length) return null
    const c = inputBytes[i]
    switch (c) {
      case 91: {
        const listNode = { type: nodeTypeList, byteLength: 0 }
        const listNodeId = insertNode(listNode)
        const startId = insertTerminal(nodeTypeStartBracket, 1)
        const childIds = [startId]
        const start = i
        i++
        while (true) {
          const elementId = go()
          if (elementId === null) break
          childIds.push(elementId)
          const type = getNodeTypeById(db, elementId)
          if (type === nodeTypeEndBracket) break
        }
        listNode.byteLength = i - start
        Object.freeze(listNode)
        db.parentToChildren.set(listNodeId, Object.freeze(childIds))
        return listNodeId
      }
      case 93: {
        i++
        return insertTerminal(nodeTypeEndBracket, 1)
      }
      default: {
        const scan = (pred, type) => {
          const start = i
          i++
          while (i < inputBytes.length && pred(inputBytes[i])) i++
          return insertTerminal(type, i - start)
        }
        if (isWordChar(c)) return scan(isWordChar, nodeTypeWord)
        if (isWhitespace(c)) return scan(isWhitespace, nodeTypeWhitespace)
        return scan((c) => !isWordChar(c) && !isWhitespace(c) && c !== 91 && c !== 93, nodeTypeIllegalChars)
      }
    }
  }
  const root = { type: nodeTypeRoot, byteLength: 0 }
  const rootId = insertNode(root)
  const childIds = []
  while (true) {
    const elementId = go()
    if (elementId === null) break
    childIds.push(elementId)
  }
  if (i !== inputBytes.length) throw new Error('expected to be at end of input')
  root.byteLength = inputBytes.length
  db.parentToChildren.set(rootId, Object.freeze(childIds))
  Object.freeze(root)
  return rootId
}

const tryIncrementParse = (inputBytes, oldTree) => {
  const db = oldTree.db
  console.log({ oldTreeChanges: oldTree.changes })

  searchRanges2(oldTree, oldTree.changes)
}

export const parse = (inputBytes, oldTree) => {
  let db
  if (oldTree) {
    const incrementalParseResult = tryIncrementParse(inputBytes, oldTree)
    if (incrementalParseResult) {
      // check if incremental matches full parse
      const fullParseDB = makeDB()
      const fullParseRootId = internalParseDB(inputBytes, fullParseDB)
    }
    db = oldTree.db
  } else {
    db = makeDB()
  }
  const rootId = internalParseDB(inputBytes, db)
  return { rootId, db, changes: [] }
}

const newTreeCursor = ({ db, rootId }) => {
  if (getNodeTypeById(db, rootId) !== nodeTypeRoot) throw new Error('expected root node')
  let offset = 0
  let nodeId = rootId
  const path = []
  return {
    gotoFirstChild: () => {
      const childrenIds = getChildrenIds(db, nodeId)
      if (childrenIds.length === 0) return false
      path.push({ id: nodeId, childIndex: 0 })
      nodeId = childrenIds[0]
      return true
    },
    gotoNextSibling: () => {
      if (path.length === 0) return false
      const cur = path.at(-1)
      const parentChildrenIds = getChildrenIds(db, cur.id)
      const nOfChildren = parentChildrenIds.length
      if (cur.childIndex === nOfChildren - 1) return false
      const newChildIndex = cur.childIndex + 1
      cur.childIndex = newChildIndex
      const byteLength = getByteLengthById(db, nodeId)
      nodeId = parentChildrenIds[newChildIndex]
      offset += byteLength
      return true
    },
    gotoParent: () => {
      if (path.length === 0) return false
      const { id, childIndex } = path.pop()
      const allSiblingIds = getChildrenIds(db, id)
      for (let i = 0; i < childIndex; i++) offset -= getByteLengthById(db, allSiblingIds[i])
      nodeId = id
      return true
    },
    getParentId: () => {
      if (path.length === 0) return null
      return path.at(-1).id
    },
    currentNodeId: () => nodeId,
    currentNode: () => getNodeById(db, nodeId),
    getOffset: () => offset,
    getPathCopy: () => [...path],
    getState: () => ({ offset, nodeId, path: [...path] }),
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

const searchRanges2 = (tree) => {
  const rangeWorkList = [...tree.changes]
  const db = tree.db
  const cursor = newTreeCursor(tree)
  const searchRange = ({ rangeOffset, rangeLength }) => {
    while (true) {
      const offset = cursor.getOffset()
      const nodeEnd = offset + getByteLengthById(db, cursor.currentNodeId())
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
          offset <= rangeOffset && rangeOffset + rangeLength <= offset + getByteLengthById(db, cursor.currentNodeId())
        // console.log({ offset, nodeEnd, isContainedUp: rangeIsContainedInNode })
        if (rangeIsContainedInNode) {
          console.log('non-terminal containing range')
          return
        }
        if (cursor.gotoNextSibling()) break
      }
    }
  }
  for (const range of rangeWorkList.reverse()) {
    searchRange(range)
  }
}

const textDecoder = new TextDecoder()
export const treeToString = (tree, bytes) => {
  const cursor = newTreeCursor(tree)
  let result = ''
  for (const { byteLength, type } of preorderGeneratorFromCursor(cursor)) {
    if (type === nodeTypeRoot || type === nodeTypeList) continue
    const offset = cursor.getOffset()
    result += textDecoder.decode(bytes.slice(offset, offset + byteLength))
  }
  return result
}

export const getErrors = (tree) => {
  const cursor = newTreeCursor(tree)
  const { db } = tree
  const errors = []
  for (const node of preorderGeneratorFromCursor(cursor)) {
    switch (node.type) {
      case nodeTypeIllegalChars:
        errors.push({ message: 'illegal-characters', node })
        break
      case nodeTypeEndBracket:
        const parentId = cursor.getParentId()
        if (parentId === null) throw new Error('expected parent')
        if (getNodeTypeById(db, parentId) !== nodeTypeList) errors.push({ message: 'extra-closing', node })
        break
      case nodeTypeList:
        const currentNodeId = cursor.currentNodeId()
        const childrenIds = getChildrenIds(db, currentNodeId)
        if (childrenIds.length === 0) throw new Error('list has no children')
        if (getNodeTypeById(db, childrenIds.at(-1)) !== nodeTypeEndBracket) errors.push({ message: 'unclosed-list', node })
        break
    }
  }
  return errors
}

import { wordWithMeta, listWithMeta } from '../core.js'

export function preorderTreesGeneratorFromCursor(tree, bytes) {
  const cursor = newTreeCursor(tree)
  const db = tree.db
  const go = (outList) => {
    const id = cursor.currentNodeId()
    const type = getNodeTypeById(db, id)
    const offset = cursor.getOffset()
    const metaData = { 'node-id': String(id), startIndex: offset }
    switch (type) {
      case nodeTypeWord: {
        const endIndex = offset + getByteLengthById(db, id)
        metaData.endIndex = endIndex
        const text = textDecoder.decode(bytes.slice(offset, endIndex))
        outList.push(wordWithMeta(text, metaData))
        return
      }
      case nodeTypeList: {
        const l = []
        if (cursor.gotoFirstChild()) {
          while (true) {
            go(l)
            if (!cursor.gotoNextSibling()) break
          }
          metaData.endIndex = cursor.getOffset() + 1
          cursor.gotoParent()
        }
        outList.push(listWithMeta(l, metaData))
        return
      }
      default:
        return
    }
  }
  const l = []
  if (cursor.gotoFirstChild())
    while (true) {
      go(l)
      if (!cursor.gotoNextSibling()) break
    }
  return l
}
