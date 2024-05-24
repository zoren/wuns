import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)
import { word, makeList, wordWithMeta, listWithMeta } from './core.js'

export const nodeToOurForm = (node) => {
  const { type, text, namedChildren, startPosition, endPosition } = node
  const range = makeList(...[startPosition.row, startPosition.column, endPosition.row, endPosition.column])
  const metaData = makeList(word('range'), range, word('node-id'), node.id)
  // todo handle error nodes
  switch (type) {
    case 'word':
      return wordWithMeta(text, metaData)
    case 'list':
      return listWithMeta(namedChildren.map(nodeToOurForm), metaData)
    default:
      console.error('unexpected node type', node, { startPosition, endPosition })
      throw new Error('unexpected node type: ' + type + ' ' + JSON.stringify({ startPosition, endPosition }))
  }
}

export const parse = (content, oldTree) => parser.parse(content, oldTree)
export const treeToForms = (tree) => tree.rootNode.children.map(nodeToOurForm)
export const parseStringToForms = (content, oldTree) => treeToForms(parse(content, oldTree))
