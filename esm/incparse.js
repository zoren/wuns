const isWhitespace = (c) => c === 32 || c === 9 || c === 10
const isWordChar = (c) => (48 <= c && c <= 57) || (97 <= c && c <= 122)
// nodes have
// id: number
// parentId, null for root nodes
// type: word, whitespace, list, illegal-chars, extra-]
// byteLength: number of bytes in a terminal node, could be the aggregated sum of children for non-terminal nodes

export const parse = (inputBytes, oldTree) => {
  let db
  if (oldTree) {
    db = oldTree.db
  } else {
    db = []
  }
  const insertNode = (type, options) => {
    const id = db.length
    const node = Object.freeze({ id, type, ...options })
    db.push(node)
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
        while (true) {
          const n = go(listNode)
          if (n === null || n.type === ']') break
        }
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
  while (go(root) !== null);
  return { root, db }
}

// export const makeDB = () => []
const getNumberOfChildren = (db, nodeId) => db.reduce((acc, { parentId }) => acc + (parentId === nodeId), 0)
const getChildren = (db, nodeId) => db.filter(({ parentId }) => parentId === nodeId)
const getChildNumber = (db, nodeId, childIndex) => {
  for (const node of db) {
    if (node.parentId !== nodeId) continue
    if (childIndex === 0) return node
    childIndex--
  }
  throw new Error('child not found')
}
const getNodeById = (db, nodeId) => db[nodeId]
const getNodeByteLength = (db, { byteLength, id }) => {
  if (byteLength !== undefined) return byteLength
  return getChildren(db, id).reduce((acc, child) => acc + getNodeByteLength(db, child), 0)
}
const newTreeCursor = (db, rootNode) => {
  let offset = 0
  let node = rootNode
  if (node.type !== 'root') throw new Error('expected root node')
  if (node.parentId) throw new Error('root node should not have a parent')
  const path = []
  return {
    gotoFirstChild: () => {
      const nOfChildren = getNumberOfChildren(db, node.id)
      if (nOfChildren === 0) return false
      node = getChildNumber(db, node.id, 0)
      path.push(0)
      return true
    },
    gotoNextSibling: () => {
      const { parentId } = node
      if (typeof parentId === 'undefined') return false
      const nOfChildren = getNumberOfChildren(db, parentId)
      const curIndex = path.at(-1)
      if (curIndex === nOfChildren - 1) return false
      const newChildIndex = path[path.length - 1] + 1
      path[path.length - 1] = newChildIndex
      offset += getNodeByteLength(db, node)
      node = getChildNumber(db, parentId, newChildIndex)
      return true
    },
    gotoParent: () => {
      const { parentId } = node
      if (typeof parentId === 'undefined') return false
      const curChildIndex = path.pop()
      const allSiblings = getChildren(db, parentId)
      const prevSiblings = allSiblings.slice(0, curChildIndex)
      offset -= prevSiblings.reduce((acc, child) => acc + getNodeByteLength(db, child), 0)
      node = getNodeById(db, parentId)
      return true
    },
    currentNode: () => node,
    get offset() {
      return offset
    },
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
  for (const { byteLength } of preorderGeneratorFromCursor(cursor)) {
    if (!byteLength) continue
    const offset = cursor.offset
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
    const offset = cursor.offset
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
          metaData.endIndex = cursor.offset + 1
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
