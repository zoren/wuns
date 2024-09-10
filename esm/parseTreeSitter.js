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
