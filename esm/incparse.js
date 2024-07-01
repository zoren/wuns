const isWhitespace = (c) => c === 32 || c === 9 || c === 10
const isWordChar = (c) => (48 <= c && c <= 57) || (97 <= c && c <= 122)
// nodes have
// id: number
// parentId, null for root nodes
// type: word, whitespace, list, illegal-chars, extra-]
// byteLength: number of bytes in a terminal node, could be the aggregated sum of children for non-terminal nodes

// todo move parentId to separate edge table, this way we can share nodes between different trees
const makeDB = () => {
  return { nodes: [] }
}
const internalParseDB = (inputBytes, db) => {
  const { nodes } = db
  const insertNode = (type, options) => {
    const id = nodes.length
    const node = { id, type, ...options }
    nodes.push(node)
    return node
  }
  const insertTerminal = (type, parent, byteLength) => insertNode(type, { parentId: parent.id, byteLength })
  let i = 0
  const go = (parent) => {
    if (i >= inputBytes.length) return null
    const c = inputBytes[i]
    switch (c) {
      case 91: {
        const listNode = insertNode('list', { parentId: parent.id })
        insertTerminal('[', listNode, 1)
        i++
        let totalByteLength = 1
        while (true) {
          const n = go(listNode)
          if (n === null) break
          totalByteLength += n.byteLength
          if (n.type === ']') break
        }
        listNode.byteLength = totalByteLength
        return listNode
      }
      case 93: {
        i++
        return insertTerminal(parent.type === 'list' ? ']' : 'extra-]', parent, 1)
      }
      default: {
        const scan = (pred, type) => {
          const start = i
          i++
          while (i < inputBytes.length && pred(inputBytes[i])) i++
          return insertTerminal(type, parent, i - start)
        }
        if (isWordChar(c)) return scan(isWordChar, 'word')
        if (isWhitespace(c)) return scan(isWhitespace, 'whitespace')
        return scan((c) => !isWordChar(c) && !isWhitespace(c) && c !== 91 && c !== 93, 'illegal-chars')
      }
    }
  }
  const root = insertNode('root', {})
  let totalByteLength = 0
  while (true) {
    const n = go(root)
    if (n === null) break
    totalByteLength += n.byteLength
  }
  if (totalByteLength !== inputBytes.length) throw new Error('byte length mismatch')
  root.byteLength = totalByteLength
  return root
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
      console.log({ offset, end, type: node.type })
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
  const root = internalParseDB(inputBytes, db)
  return { root, db, changes: [] }
}

const getNumberOfChildren = (db, nodeId) => db.nodes.reduce((acc, { parentId }) => acc + (parentId === nodeId), 0)
const getChildren = (db, nodeId) => db.nodes.filter(({ parentId }) => parentId === nodeId)
const getChildNumber = (db, nodeId, childIndex) => {
  for (const node of db.nodes) {
    if (node.parentId !== nodeId) continue
    if (childIndex === 0) return node
    childIndex--
  }
  throw new Error('child not found')
}
const getNodeById = (db, nodeId) => db.nodes[nodeId]
const getNodeByteLength = (db, { byteLength, id }) => {
  if (byteLength !== undefined) return byteLength
  return getChildren(db, id).reduce((acc, child) => acc + getNodeByteLength(db, child), 0)
}
export const getTotalNumberOfNodes = (db) => db.nodes.length

// {rangeOffset: 4, rangeLength: 0, text: 'a'}
// {rangeOffset: 2, rangeLength: 0, text: 'a'}
// {rangeOffset: 0, rangeLength: 0, text: 'a'}

const newTreeCursor = (db, rootNode) => {
  let offset = 0
  let node = rootNode
  if (node.type !== 'root') throw new Error('expected root node')
  const path = []
  return {
    gotoFirstChild: () => {
      const { id } = node
      const nOfChildren = getNumberOfChildren(db, id)
      if (nOfChildren === 0) return false
      node = getChildNumber(db, id, 0)
      path.push({ id, childIndex: 0 })
      return true
    },
    gotoNextSibling: () => {
      if (path.length === 0) return false
      const cur = path.at(-1)
      const nOfChildren = getNumberOfChildren(db, cur.id)
      if (cur.childIndex === nOfChildren - 1) return false
      const newChildIndex = cur.childIndex + 1
      cur.childIndex = newChildIndex
      offset += getNodeByteLength(db, node)
      node = getChildNumber(db, cur.id, newChildIndex)
      return true
    },
    gotoParent: () => {
      if (path.length === 0) return false
      const cur = path.pop()
      const allSiblings = getChildren(db, cur.id)
      const prevSiblings = allSiblings.slice(0, cur.childIndex)
      offset -= prevSiblings.reduce((acc, child) => acc + getNodeByteLength(db, child), 0)
      node = getNodeById(db, cur.id)
      return true
    },
    currentNode: () => node,
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

const visitTree = (db, root) => {
  const cursor = newTreeCursor(db, root)
  for (const node of preorderGeneratorFromCursor(cursor)) {
    console.log(node)
  }
}

const textDecoder = new TextDecoder()
export const treeToString = (db, root, bytes) => {
  const cursor = newTreeCursor(db, root)
  let result = ''
  for (const { byteLength, type } of preorderGeneratorFromCursor(cursor)) {
    if (type === 'root' || type === 'list') continue
    const offset = cursor.getOffset()
    result += textDecoder.decode(bytes.slice(offset, offset + byteLength))
  }
  return result
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
