import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)
import { makeList, wordWithMeta, listWithMeta } from './core.js'

/**
 * @param {TSParser.SyntaxNode} node
 */
const nodeToOurForm = (node) => {
  const { type, text, namedChildren, startPosition, endPosition, isError, startIndex, endIndex } = node
  if (isError) return null
  const range = makeList(...[startPosition.row, startPosition.column, endPosition.row, endPosition.column])
  // const metaData = makeList(word('range'), range, word('node-id'), String(node.id))
  const metaData = { range, 'node-id': String(node.id), startIndex, endIndex }
  // (word('range'), range, word('node-id'), String(node.id))
  switch (type) {
    case 'word':
      return wordWithMeta(text, metaData)
    case 'list':
      return listWithMeta(childrenToOurForm(namedChildren), metaData)
    default:
      throw new Error('unexpected node type: ' + type)
  }
}

const childrenToOurForm = (children) => {
  const l = []
  for (const child of children) {
    if (child.isError) continue
    const form = nodeToOurForm(child)
    if (form !== null) l.push(form)
  }
  return l
}

export const parse = (content, oldTree) => parser.parse(content, oldTree)
export const treeToForms = (tree) => childrenToOurForm(tree.rootNode.namedChildren)
export const parseStringToForms = (content, oldTree) => treeToForms(parse(content, oldTree))
