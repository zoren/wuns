const unit = Object.freeze([])
const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))
const isUnit = (x) => x === unit || (Array.isArray(x) && Object.isFrozen(x) && x.length === 0)
// /[a-z0-9.=-]+/
const wordRegex = /^[a-z0-9.=-]+$/
const isWordString = (s) => typeof s === 'string' && s.length > 0 && wordRegex.test(s)
class Word {
  constructor(value) {
    if (!isWordString(value)) throw new Error('invalid word: ' + value)
    this.value = value
  }

  toString() {
    return this.value
  }
}
const isSigned32BitInteger = (n) => (n | 0) === n
// todo what about words representing large integers?
const isWord = (f) => isSigned32BitInteger(f) || (typeof f === 'string' && isWordString(s)) || f instanceof Word
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
const wordString = (w) => {
  if (w instanceof Word) return w.value
  if (typeof w === 'string') return w
  if (isSigned32BitInteger(w)) return String(w)
  throw new Error('not a word: ' + w + ' ' + typeof w)
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
  if (!isSigned32BitInteger(n)) throw new Error('expected 32-bit signed integer, found: ' + s)
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
  wordString,
  print,
  number,
}
