const isWhitespace = (c) => c === 32 || c === 9 || c === 10
const isWordChar = (c) => (48 <= c && c <= 57) || (97 <= c && c <= 122)

const parse = (db, inputBytes) => {
  const insertNode = (type, options) => {
    const id = db.length
    const node = Object.freeze({ id, type, ...options })
    db.push(node)
    return node
  }
  const insertParentNode = (type, parent, options) => insertNode(type, { parentId: parent.id, ...options })

  let i = 0

  const go = (parent) => {
    if (i >= inputBytes.length) return null
    const c = inputBytes[i]
    switch (c) {
      case 91: {
        const listNode = insertParentNode('list', parent)
        insertParentNode('[', listNode, { byteLength: 1 })
        i++
        while (true) {
          const n = go(listNode)
          if (n === null || n.type === ']') break
        }
        return listNode
      }
      case 93: {
        // ? what about when parent is not a list?
        const node = insertParentNode(']', parent, { byteLength: 1 })
        i++
        return node
      }
      default: {
        const scan = (pred, type) => {
          const start = i
          i++
          while (i < inputBytes.length && pred(inputBytes[i])) i++
          return insertParentNode(type, parent, { byteLength: i - start })
        }
        if (isWordChar(c)) return scan(isWordChar, 'word')
        if (isWhitespace(c)) return scan(isWhitespace, 'whitespace')
        return scan((c) => !isWhitespace(c) && !isWordChar(c) && c !== 91 && c !== 93, 'error')
      }
    }
  }
  const root = insertNode('root', {})
  while (true) {
    const n = go(root)
    if (n === null) break
  }
  return root
}

const getNumberOfChildren = (db, nodeId) => db.reduce((acc, { parentId }) => acc + (parentId === nodeId ? 1 : 0), 0)
const getChildren = (db, nodeId) => db.filter(({ parentId }) => parentId === nodeId)
const getChildNumber = (db, nodeId, childIndex) => {
  for (const node of db) {
    if (node.parentId !== nodeId) continue
    if (childIndex === 0) return node
    childIndex--
  }
  console.log({ nodeId, childIndex })
  throw new Error('child not found')
}

const newTreeCursor = (db, rootNode) => {
  let offset = 0
  let node = rootNode
  if (node.type !== 'root') throw new Error('expected root node')
  if (node.parentId) throw new Error('root node should not have a parent')
  const path = []
  const getNodeByteLength = (node) => {
    if (node.byteLength !== undefined) return node.byteLength
    return getChildren(db, node.id).reduce((acc, child) => acc + getNodeByteLength(child), 0)
  }
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
      offset += getNodeByteLength(node)
      node = getChildNumber(db, parentId, newChildIndex)
      return true
    },
    gotoParent: () => {
      const { parentId } = node
      if (typeof parentId === 'undefined') return false
      if (path.length === 0) throw new Error('path is empty')
      const curChildIndex = path.pop()
      const allSiblings = getChildren(db, parentId)
      const prevSiblings = allSiblings.slice(0, curChildIndex)
      offset -= prevSiblings.reduce((acc, child) => acc + getNodeByteLength(child), 0)
      node = db[parentId]
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
const printTree = (db, root, bytes) => {
  const cursor = newTreeCursor(db, root)
  let result = ''
  for (const node of preorderGeneratorFromCursor(cursor)) {
    if (!node.byteLength) continue
    const offset = cursor.offset
    const endOffset = offset + node.byteLength
    const slice = bytes.slice(offset, endOffset)
    const str = textDecoder.decode(slice)
    result += str
  }
  console.log(result)
}

const tests = ['', 'abc 123', '[quote 34]', '[quote 34', 'ILLEGAL but then legal', `[if [eq 4 x] [] x]`]
const textEncoder = new TextEncoder()
for (const test of tests) {
  const db = []
  const bytes = textEncoder.encode(test)
  const root = parse(db, bytes)
  console.log()
  console.log()
  console.log(test)

  printTree(db, root, bytes)
}

if (false) {
  // .load incparse.js
  let s = `abc 123`
  let db = []
  let root = parse(db, textEncoder.encode(s))
  let cursor = newTreeCursor(db, root)
  // cursorNext(cursor)
  cursor.currentNode()

  cursor.gotoFirstChild()
  cursor.gotoNextSibling()
}
