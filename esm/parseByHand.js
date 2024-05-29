import { unit } from './core.js'

const isWhitespace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r'

const isWordChar = (c) =>
  ('a' <= c && c <= 'z') || ('0' <= c && c <= '9') || c === '.' || c === '=' || c === '/' || c === '-'

export const parseStringToForms = (content) => {
  if (typeof content !== 'string') throw new Error(`expected string got ${typeof content}`)
  let i = 0
  const go = () => {
    while (i < content.length) {
      const c = content[i]
      if (isWhitespace(c)) {
        i++
        continue
      }
      switch (c) {
        case '[': {
          const forms = []
          i++
          while (i < content.length) {
            if (isWhitespace(content[i])) {
              i++
              continue
            }
            if (content[i] === ']') {
              i++
              break
            }
            const form = go()
            if (form === null) break
            forms.push(form)
          }
          return forms.length === 0 ? unit : Object.freeze(forms)
        }
        case ']':
          i++
          continue
      }
      if (!isWordChar(c)) throw new Error(`illegal character code ${c}`)
      const wordStartCol = i
      i++
      while (i < content.length && isWordChar(content[i])) i++
      const s = content.slice(wordStartCol, i)
      const n = Number(s)
      if (n | 0 === n) return n
      return s
    }
    return null
  }
  const forms = []
  let form
  while ((form = go()) != null) forms.push(form)
  return forms
}

// const tests = [
//   [[], ``],
//   [['abc'], `abc`],
//   [['123'], `123`],
//   [['abc', '123'], `abc 123`],
//   [[[]], `[]`],
//   [[[[[]]]], `[[[]]]`],
//   [[['quote', 'abc']], `[quote abc]`],
//   [[['if', ['eq', '2', '34'], 'true', 'false']], `[if [eq 2 34] true false]`],
//   [[[]], `[ ]`],
//   [[[]], `[ ]]`],
//   [[[]], `[ `],
// ]

// for (const [expected, content] of tests) {
//   const actual = parseAll(content)
//   const expectedJSON = JSON.stringify(expected)
//   const actualJSON = JSON.stringify(actual)
//   if (expectedJSON !== actualJSON) {
//     console.error({ expected, actual, content })
//   }
// }
