import { parse, treeToString, preorderTreesGeneratorFromCursor } from './incparse.js'

const tests = ['', 'abc 123', '[quote 34]', '[quote 34', 'ILLEGAL but then legal', `[if [eq 4 x] [] x]`, '[]]']
const textEncoder = new TextEncoder()
for (const test of tests) {
  const bytes = textEncoder.encode(test)
  const { db, root } = parse(bytes)
  console.log()
  console.log(`'${test}'`)

  console.log(`'${treeToString(db, root, bytes)}'`)
  const tree = preorderTreesGeneratorFromCursor(db, root, bytes)
  console.log(JSON.stringify(tree, null, 2))
}

// // .load incparse.js
// let s = `abc 123`
// let db = []
// let root = parse(db, textEncoder.encode(s))
// let cursor = newTreeCursor(db, root)
// // cursorNext(cursor)
// cursor.currentNode()

// cursor.gotoFirstChild()
// cursor.gotoNextSibling()
