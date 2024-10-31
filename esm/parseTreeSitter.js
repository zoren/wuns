import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)

const parse = (content, oldTree) => {
  // workaround for https://github.com/tree-sitter/node-tree-sitter/issues/199
  // without it we cannot parse strings longer than 32768 bytes
  const bufferSize = content.length + 1
  return parser.parse(content, oldTree, { bufferSize })
}

export const parseTagTreeSitter = (content, contentName) => {
  const tree = parse(content)
  tree.contentName = contentName
  return tree
}

const formToNodeMap = new WeakMap()

export const tryGetNodeFromForm = (form) => formToNodeMap.get(form)

import {
  makeFormWord,
  makeFormList,
} from './core.js'

/**
 * @param {TSParser.Tree} tree
 * @returns { topForms: readonly TaggedValue[], formToNodeMap: Map<TaggedValue, TSParser.SyntaxNode> }
 */
export const treeToFormsSafeNoMeta = (tree) => {
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const tryNodeToForm = (node) => {
    const { isError, type } = node
    const mkWord = () => {
      const formWord = makeFormWord(node.text)
      formToNodeMap.set(formWord, node)
      return formWord
    }
    const mkList = () => {
      const formList = makeFormList(childrenToList(node))
      formToNodeMap.set(formList, node)
      return formList
    }
    if (isError) {
      console.log('error node:', tree.contentName, node.startPosition)
      const { text } = node
      if (text.startsWith(']')) return null
      if (text.startsWith('[')) return mkList()
      return mkWord()
    }
    switch (type) {
      case 'word':
        return mkWord()
      case 'list':
        return mkList()
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  const childrenToList = (node) => {
    const childForms = []
    for (const child of node.namedChildren) {
      const subForm = tryNodeToForm(child)
      if (subForm) childForms.push(subForm)
    }
    return Object.freeze(childForms)
  }
  return childrenToList(tree.rootNode)
}

// export const readString = (content, contentName) => {
//   const tree = parseTagTreeSitter(content, contentName)
//   return arrayToList(treeToFormsSafeNoMeta(tree, contentName))
// }
