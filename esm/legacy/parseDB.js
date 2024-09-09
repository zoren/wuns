const isWhitespace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r'

const isWordChar = (c) =>
  ('a' <= c && c <= 'z') || ('0' <= c && c <= '9') || c === '.' || c === '=' || c === '/' || c === '-'

const makeDB = () => ({ nodes: [], edges: [] })

const insertDBEdge = ({ edges }, parentId, nodeId) => {
  edges.push({ parentId, nodeId })
}

const insertDBNode = ({ nodes }, nodeInfo) => {
  const nodeId = nodes.length
  nodes.push({ id: nodeId, ...nodeInfo })
  return nodeId
}

export const parseStringToId = (content, db) => {
  if (typeof content !== 'string') throw new Error(`expected string got ${typeof content}`)
  let offset = 0
  const insertNode = (type, parentId, additionalOptions) => {
    const nodeId = insertDBNode(db, Object.freeze({ type, ...additionalOptions }))
    if (parentId !== null) insertDBEdge(db, parentId, nodeId)
    return nodeId
  }
  const insertOffsetNode = (type, parentId, additionalOptions) =>
    insertNode(type, parentId, { offset, ...additionalOptions })
  const go = (parentId) => {
    while (offset < content.length) {
      const c = content[offset]
      if (isWhitespace(c)) {
        offset++
        continue
      }
      if (c === '[') {
        const listId = insertNonTerminal('list', parentId)
        insertTerminal('[', listId)
        offset++
        while (offset < content.length) {
          const char = content[offset]
          if (isWhitespace(char)) {
            offset++
            continue
          }
          if (char === ']') {
            insertTerminal(']', listId)
            offset++
            return
          }
          go(listId)
        }
        // maybe we shouldn't put an offset in here
        insertOffsetNode('error', listId, { errorReason: 'list-not-closed' })
        return
      }
      if (!isWordChar(c)) {
        insertOffsetNode('error', parentId, { errorReason: 'illegal-char' })
        offset++
        continue
      }
      const wordStartCol = offset
      offset++
      while (offset < content.length && isWordChar(content[offset])) offset++
      // todo use length and distance to previous token, this allows sharing of nodes with next parse, should parent id then be part of relation??
      insertTerminal('word', parentId, { offset: wordStartCol, endOffset: offset, length: offset - wordStartCol })
      return
    }
    return
  }
  const rootNodeId = insertNonTerminal('root', null)
  while (offset < content.length) go(rootNodeId)
  return rootNodeId
}

const selectNodeById = (db, id) => {
  if (typeof id !== 'number') throw new Error('expected number: ' + JSON.stringify(id))
  const node = db.nodes[id]
  if (!node) throw new Error('node not found: ' + id)
  return node
}
const selectChildren = (db, id) => db.nodes.filter((n) => n.parentId === id)

const dbIdToForm = (content, db, rootId, includeErrors = true) => {
  const childPred = includeErrors
    ? ({ type }) => type === 'word' || type === 'list' || type === 'error'
    : ({ type }) => type === 'word' || type === 'list'
  const goChildren = (id) =>
    selectChildren(db, id)
      .filter(childPred)
      .map(({ id }) => go(id))
  const go = (id) => {
    const node = selectNodeById(db, id)
    const { type } = node
    switch (type) {
      case 'word': {
        const { offset, endOffset } = node
        return content.slice(offset, endOffset)
      }
      case 'list':
        return goChildren(id)
      case 'error':
        return `[error ${node.errorReason}]`
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  return goChildren(rootId)
}

const tests = [
  [[], ``],
  [['abc'], `abc`],
  [['123'], `123`],
  [['abc', '123'], `abc 123`],
  [[[]], `[]`],
  [[[[[]]]], `[[[]]]`],
  [[['quote', 'abc']], `[quote  abc ] `],
  [[['quote', ['abc'], '123']], `[quote [abc ] 123]`],
  [[['if', ['eq', '2', '34'], 'true', 'false']], `[if [eq 2 34] true false]`],
  [[[]], `[ ]`],
  [[['1', '2'], '[error illegal-char]'], `[1 2]]`],
  [[['1', '2'], '[error illegal-char]'], `[1 2]!`],
  [[['1', '2', '[error list-not-terminated]']], `[1 2 `],
]

for (const [expected, content] of tests) {
  const db = makeDB()
  const id = parseStringToId(content, db)
  try {
    const actual = dbIdToForm(content, db, id)
    const expectedJSON = JSON.stringify(expected)
    const actualJSON = JSON.stringify(actual)
    if (expectedJSON !== actualJSON) {
      console.dir({ expected, actual, content, db }, { depth: null })
    }
  } catch (e) {
    console.error(e)
    console.dir({ content, db }, { depth: null })
  }
}
