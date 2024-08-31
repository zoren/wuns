import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)
import { wordWithMeta, listWithMeta } from './core.js'

export const parse = (content, oldTree) => {
  // workaround for https://github.com/tree-sitter/node-tree-sitter/issues/199
  // without it we cannot parse strings longer than 32768 bytes
  const bufferSize = content.length + 1
  return parser.parse(content, oldTree, { bufferSize })
}
export const treeToForms = (tree, filePath) => {
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const nodeToOurForm = (node) => {
    const { type, text, startPosition, isError } = node
    if (isError) return null
    const { row, column } = startPosition
    const metaData = {
      // range,
      // 'tree-sitter-node-id': word(String(node.id)),
      // 'start-index': startIndex,
      // 'end-index': endIndex,
    }
    if (filePath) {
      // metaData['file-path'] = filePath
      metaData['location'] = `${filePath}:${row + 1}:${column + 1}`
    }
    Object.freeze(metaData)
    switch (type) {
      case 'word':
        return wordWithMeta(text, metaData)
      case 'list':
        return listWithMeta(childrenToOurForm(node), metaData)
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  const childrenToOurForm = (node) => {
    const l = []
    for (const child of node.namedChildren) {
      if (child.isError) continue
      const form = nodeToOurForm(child)
      if (form !== null) l.push(form)
    }
    return l
  }
  return childrenToOurForm(tree.rootNode)
}
export const parseStringToForms = (content) => treeToForms(parse(content))
import fs from 'fs'
export const parseFile = (filename) => treeToForms(parse(fs.readFileSync(filename, 'ascii')), filename)
