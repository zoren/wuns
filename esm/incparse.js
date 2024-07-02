const isWhitespace = (c) => c === 32 || c === 9 || c === 10
const otherWordChars = new Set([...'.=/-'].map((c) => c.charCodeAt(0)))
const isWordChar = (c) => (97 <= c && c <= 122) || (48 <= c && c <= 57) || otherWordChars.has(c)
// nodes have
// id: number
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

export const getTotalNumberOfNodes = (db) => db.nodes.length
export const calcTotalNumberOfEdges = (db) => {
  let count = 0
  for (const [, childIds] of db.parentToChildren) {
    count += childIds.length
  }
  return count
}

const insertOneToMany = (m, key, value) => {
  let l = m.get(key)
  if (l === undefined) {
    l = []
    m.set(key, l)
  }
  l.push(value)
}

const internalParseDB = (inputBytes, db) => {
  const { nodes } = db
  const insertNode = (node) => {
    const id = nodes.length
    nodes.push(node)
    return id
  }
  const insertDBEdge = (parentId, childId) => insertOneToMany(db.parentToChildren, parentId, childId)
  const insertTerminal = (type, parentId, byteLength) => {
    const nodeId = insertNode({ type, byteLength })
    insertDBEdge(parentId, nodeId)
    return nodeId
  }
  let i = 0
  const go = (parentId) => {
    if (i >= inputBytes.length) return null
    const c = inputBytes[i]
    switch (c) {
      case 91: {
        const listNode = { type: 'list', byteLength: 0 }
        const listNodeId = insertNode(listNode)
        insertDBEdge(parentId, listNodeId)
        insertTerminal('[', listNodeId, 1)
        i++
        let totalByteLength = 1
        while (true) {
          const elementId = go(listNodeId)
          if (elementId === null) break
          const { byteLength, type } = getNodeById(db, elementId)
          totalByteLength += byteLength
          if (type === ']') break
        }
        listNode.byteLength = totalByteLength
        return listNodeId
      }
      case 93: {
        i++
        return insertTerminal(']', parentId, 1)
      }
      default: {
        const scan = (pred, type) => {
          const start = i
          i++
          while (i < inputBytes.length && pred(inputBytes[i])) i++
          return insertTerminal(type, parentId, i - start)
        }
        if (isWordChar(c)) return scan(isWordChar, 'word')
        if (isWhitespace(c)) return scan(isWhitespace, 'whitespace')
        return scan((c) => !isWordChar(c) && !isWhitespace(c) && c !== 91 && c !== 93, 'illegal-chars')
      }
    }
  }
  const root = { type: 'root', byteLength: 0 }
  const rootId = insertNode(root)
  let totalByteLength = 0
  while (true) {
    const topLevelNodeId = go(rootId)
    if (topLevelNodeId === null) break
    const { byteLength } = getNodeById(db, topLevelNodeId)
    totalByteLength += byteLength
  }
  if (totalByteLength !== inputBytes.length) throw new Error('byte length mismatch')
  root.byteLength = totalByteLength
  return rootId
}

export const parse = (inputBytes, oldTree) => {
  let db
  if (oldTree) {
    db = oldTree.db
    if (oldTree.changes.length !== 1) throw new Error('multiple changes not implemented')
    const change = oldTree.changes[0]
    const { rangeOffset, rangeLength, bytes } = change

    // search for changed terminal nodes
    let root = oldTree.root
    // const path = []
    const cursor = newTreeCursor(db, root)
    console.log('searching for', { rangeOffset, rangeLength })
    while (true) {
      const node = cursor.currentNode()
      const offset = cursor.getOffset()
      const end = offset + node.byteLength
      if (offset <= rangeOffset && rangeOffset + rangeLength <= end) {
        if (cursor.gotoFirstChild()) continue
        break
      }
      if (!cursor.gotoNextSibling()) break
    }
    console.log('found', cursor.getPathCopy())
    if (bytes.length === 0) {
      // create new node with rangeLength bytes removed
    } else {
      // parse bytes and merge the resulting root node into the found node creating new nodes all the way to the root
      const changeRoot = internalParseDB(bytes, db)
    }

    // if (rangeOffset > cursor.getOffset() + cursor.currentNode().byteLength) throw new Error('rangeOffset out of bounds')

    // while (cursor.gotoFirstChild());
    // if (cursor.getOffset() !== 0) throw new Error('expected cursor to be at start')
  } else {
    db = makeDB()
  }
  const rootId = internalParseDB(inputBytes, db)
  return { rootId, db, changes: [] }
}

const newTreeCursor = (db, rootId) => {
  if (getNodeById(db, rootId).type !== 'root') throw new Error('expected root node')
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
      const { byteLength } = getNodeById(db, nodeId)
      nodeId = parentChildrenIds[newChildIndex]
      offset += byteLength
      return true
    },
    gotoParent: () => {
      if (path.length === 0) return false
      const cur = path.pop()
      const allSiblingIds = getChildrenIds(db, cur.id)
      const prevSiblingIds = allSiblingIds.slice(0, cur.childIndex)
      offset -= prevSiblingIds.reduce((acc, childId) => acc + getNodeById(db, childId).byteLength, 0)
      nodeId = cur.id
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
  }
}

//  https://docs.rs/tree-sitter-traversal/latest/src/tree_sitter_traversal/lib.rs.html#376-381
function* generatorFromCursor(cursor, order = 'pre') {
  while (true) {
    if (order === 'pre') yield cursor.currentNode()
    if (cursor.gotoFirstChild()) continue
    const node = cursor.currentNode()
    if (cursor.gotoNextSibling()) {
      if (order === 'post') yield node
      continue
    }
    while (true) {
      if (order === 'post') yield cursor.currentNode()
      if (!cursor.gotoParent()) return
      const node = cursor.currentNode()
      if (cursor.gotoNextSibling()) {
        if (order === 'post') yield node
        break
      }
    }
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

const textDecoder = new TextDecoder()
export const treeToString = ({ db, rootId }, bytes) => {
  const cursor = newTreeCursor(db, rootId)
  let result = ''
  for (const { byteLength, type } of preorderGeneratorFromCursor(cursor)) {
    if (type === 'root' || type === 'list') continue
    const offset = cursor.getOffset()
    result += textDecoder.decode(bytes.slice(offset, offset + byteLength))
  }
  return result
}

export const getErrors = ({ db, rootId }) => {
  const cursor = newTreeCursor(db, rootId)
  const errors = []
  for (const node of preorderGeneratorFromCursor(cursor)) {
    switch (node.type) {
      case 'illegal-chars':
        errors.push({ message: 'illegal-characters', node })
        break
      case ']':
        const parentId = cursor.getParentId()
        if (parentId === null) throw new Error('expected parent')
        if (getNodeById(db, parentId).type !== 'list') errors.push({ message: 'extra-closing', node })
        break
      case 'list':
        const currentNodeId = cursor.currentNodeId()
        const childrenIds = getChildrenIds(db, currentNodeId)
        if (childrenIds.length === 0) throw new Error('list has no children')
        if (getNodeById(db, childrenIds.at(-1)).type !== ']') errors.push({ message: 'unclosed-list', node })
        break
    }
  }
  return errors
}

import { wordWithMeta, listWithMeta } from './core.js'

export function preorderTreesGeneratorFromCursor(db, root, bytes) {
  const cursor = newTreeCursor(db, root)
  const go = (outList) => {
    const node = cursor.currentNode()
    const { type, id } = node
    const offset = cursor.getOffset()
    const metaData = { 'node-id': String(id), startIndex: offset }
    switch (type) {
      case 'word': {
        const { byteLength } = node
        const endIndex = offset + byteLength
        metaData.endIndex = endIndex
        const text = textDecoder.decode(bytes.slice(offset, endIndex))
        outList.push(wordWithMeta(text, metaData))
        return
      }
      case 'list': {
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
