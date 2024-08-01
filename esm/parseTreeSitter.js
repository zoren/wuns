import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)
import { makeList, wordWithMeta, listWithMeta, word } from './core.js'

export const parse = (content, oldTree) => parser.parse(content, oldTree)

export const treeToForms = (tree, filePath) => {
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const nodeToOurForm = (node) => {
    const { type, text, startPosition, endPosition, isError, startIndex, endIndex } = node
    if (isError) return null
    const range = makeList(...[startPosition.row, startPosition.column, endPosition.row, endPosition.column])
    const metaData = { range, 'node-id': word(String(node.id)), startIndex, endIndex }
    if (filePath) metaData['file-path'] = filePath
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
