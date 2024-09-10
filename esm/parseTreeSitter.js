import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)
import { word, formWord, formList } from './core.js'

export const parse = (content, oldTree) => {
  // workaround for https://github.com/tree-sitter/node-tree-sitter/issues/199
  // without it we cannot parse strings longer than 32768 bytes
  const bufferSize = content.length + 1
  return parser.parse(content, oldTree, { bufferSize })
}
export function* treeToForms(tree, filePath) {
  const filePathPrefix = filePath ? filePath + ':' : ''
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const nodeToOurForm = (node) => {
    const { type, text, startPosition, isError } = node
    if (isError) return null
    const { row, column } = startPosition
    const metaData = Object.freeze({ location: `${filePathPrefix}${row + 1}:${column + 1}` })
    switch (type) {
      case 'word':
        return formWord(word(text), metaData)
      case 'list':
        const l = []
        for (const child of node.namedChildren) {
          const form = nodeToOurForm(child)
          if (form !== null) l.push(form)
        }
        Object.freeze(l)
        return formList(l, metaData)
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  for (const child of tree.rootNode.namedChildren) {
    const form = nodeToOurForm(child)
    if (form !== null) yield form
  }
}
export const parseStringToForms = (content) => treeToForms(parse(content))
import fs from 'fs'
export const parseFile = (filename) => treeToForms(parse(fs.readFileSync(filename, 'ascii')), filename)
