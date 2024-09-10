import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)

export const parse = (content, oldTree) => {
  // workaround for https://github.com/tree-sitter/node-tree-sitter/issues/199
  // without it we cannot parse strings longer than 32768 bytes
  const bufferSize = content.length + 1
  return parser.parse(content, oldTree, { bufferSize })
}

export function* treeToFormsHost(tree, hostModule, filePath) {
  const getHostValue = (name) => {
    const v = hostModule[name]
    if (!v) throw new Error(`host value not found: ${name}`)
    return v
  }
  const formWord = getHostValue('form-word'),
    formList = getHostValue('form-list')
  const mutableListOfSize = getHostValue('mutable-list-of-size'),
    setArray = getHostValue('set-array'),
    freezeMutableList = getHostValue('freeze-mutable-list')
  const emptyList = mutableListOfSize(0)
  freezeMutableList(emptyList)
  const transientKVMap = getHostValue('transient-kv-map')
  const setKVMap = getHostValue('set-kv-map')
  const freezeKVMap = getHostValue('freeze-kv-map')
  // stringToWord is a lifting function it takes a string(not a wuns value) and returns a word
  const stringToWord = getHostValue('stringToWord')
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const nodeToForm = (node) => {
    const { type, text, startPosition, isError, namedChildCount } = node
    if (isError) throw new Error('unexpected error node')
    const { row, column } = startPosition
    const metaData = transientKVMap()
    if (filePath) setKVMap(metaData, stringToWord('file-path'), stringToWord(filePath))
    setKVMap(metaData, stringToWord('row'), stringToWord(String(row + 1)))
    setKVMap(metaData, stringToWord('column'), stringToWord(String(column + 1)))
    freezeKVMap(metaData)
    switch (type) {
      case 'word':
        return formWord(stringToWord(text), metaData)
      case 'list':
        let l
        if (namedChildCount) {
          l = mutableListOfSize(namedChildCount)
          for (let i = 0; i < namedChildCount; i++) setArray(l, i, nodeToForm(node.namedChild(i)))
          freezeMutableList(l)
        } else {
          l = emptyList
        }
        return formList(l, metaData)
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  for (const child of tree.rootNode.namedChildren) yield nodeToForm(child)
}

export const parseStringToFormsHost = (hostObject, content) => treeToFormsHost(parse(content), hostObject)
export const parseStringToFirstFormsHost = (hostObject, content) => {
  for (const form of treeToFormsHost(parse(content), hostObject)) return form
  throw new Error('no forms found')
}

import fs from 'fs'
export const parseFileHost = (hostObject, filename) =>
  treeToFormsHost(parse(fs.readFileSync(filename, 'ascii')), hostObject, filename)
