const unit = Object.freeze([])
const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))
const isUnit = (x) => x === unit || (Array.isArray(x) && Object.isFrozen(x) && x.length === 0)

class Word {
  constructor(value) {
    this.value = value
  }

  toString() {
    return this.value
  }
}

const isWord = (f) => f instanceof Word
const isList = (f) => Array.isArray(f)
const word = (s) => {
  if (typeof s !== 'string') throw new Error('word expects string arguments only')
  return Object.freeze(new Word(s))
}
const symbolMeta = Symbol.for('wuns-meta')
const wordWithMeta = (s, meta) => {
  if (typeof s !== 'string') throw new Error('word-with-mwta expects string arguments only')
  const w = new Word(s)
  w[symbolMeta] = meta
  return Object.freeze(w)
}
const listWithMeta = (l, meta) => {
  const ll = [...l]
  ll[symbolMeta] = meta
  return Object.freeze(ll)
}
const meta = (form) => {
  if (form[symbolMeta]) return form[symbolMeta]
  return unit
}
const numberWord = (n) => {
  if (typeof n !== 'number') throw new Error('numberWord expects number')
  return word(String(n))
}
const wordString = (w) => {
  if (!isWord(w)) throw new Error('not a word: ' + w + ' ' + typeof w)
  return w.value
}
const print = (x) => {
  if (isWord(x)) return wordString(x)
  if (!Array.isArray(x)) throw new Error(`cannot print ${x} expected word or list ${typeof x} ${x.constructor}`)
  return `[${x.map(print).join(' ')}]`
}
const number = (f) => {
  if (!isWord(f)) throw new Error('expected word: ' + f)
  const s = wordString(f)
  const n = Number(s)
  if (isNaN(n)) throw new Error('expected number, found: ' + s)
  const normalised = n | 0
  if (n !== normalised) throw new Error('expected 32-bit signed integer, found: ' + s)
  // if (String(normalised) !== s) throw new Error('expected normalized integer, found: ' + s)
  return n
}

module.exports = {
  unit,
  makeList,
  isUnit,
  Word,
  isWord,
  isList,
  word,
  wordWithMeta,
  listWithMeta,
  meta,
  numberWord,
  wordString,
  print,
  number,
}
