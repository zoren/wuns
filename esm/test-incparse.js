import { parse, treeToString, getTotalNumberOfNodes, calcTotalNumberOfEdges, getErrors } from './incparse.js'

const okTests = ['', 'abc 123', '[]', '[ ]', '[quote 34]', `[if [eq 4 x] [] x]`, 'we-allow-dashes']
const errorTests = [[['illegal-characters'], '234 ILLEGAL but then legal'], [['extra-closing'],'[]]'], [['unclosed-list'], '[quote 34']]

const tests = okTests.map(test => [[], test]).concat(errorTests)

const textEncoder = new TextEncoder()
for (const [expectedErrors, test] of tests) {
  const bytes = textEncoder.encode(test)
  const tree = parse(bytes)
  const errors = getErrors(tree)
  if (expectedErrors.length !== errors.length) {
    console.log(`expected errors: ${expectedErrors.length} actual errors: ${errors.length}`)
    console.log(`expected: ${JSON.stringify(expectedErrors)} actual: ${JSON.stringify(errors)}`)
    continue
  }
  for (let i = 0; i < expectedErrors.length; i++) {
    if (expectedErrors[i] !== errors[i].message) {
      console.log(`expected error: ${expectedErrors[i]} actual error: ${errors[i].message}`)
      console.log(`expected: ${JSON.stringify(expectedErrors)} actual: ${JSON.stringify(errors)}`)
      break
    }
  }
  console.log()
  console.log(`'${test}'`)

  console.log(`'${treeToString(tree, bytes)}'`)
  const { db } = tree
  console.log(`db nodes: ${getTotalNumberOfNodes(db)} edges: ${calcTotalNumberOfEdges(db)}`)
}
