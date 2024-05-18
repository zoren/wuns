export const unit = Object.freeze([])
export const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))
export const isUnit = (x) => x === unit || (Array.isArray(x) && Object.isFrozen(x) && x.length === 0)

const isSigned32BitInteger = (n) => (n | 0) === n
const wordRegex = /^[a-z0-9.=/-]+$/
export const isWordString = (s) => typeof s === 'string' && s.length > 0 && wordRegex.test(s)
class Word {
  constructor(value) {
    const n = Number(value)
    if (isSigned32BitInteger(n)) {
      this.value = n
    } else if (isWordString(value)) {
      this.value = value
    } else throw new Error('invalid word: "' + value + '" ' + typeof value)
  }

  toString() {
    return String(this.value)
  }
}
export const word = (s) => Object.freeze(new Word(s))
// todo what about words representing large integers?
export const isWord = (f) => isSigned32BitInteger(f) || (typeof f === 'string' && isWordString(f)) || f instanceof Word
export const is_word = (f) => isWord(f) | 0
export const wordValue = (w) => {
  if (w instanceof Word) return w.value
  if (typeof w === 'string') return w
  if (isSigned32BitInteger(w)) return w
  throw new Error('not a word: ' + w + ' ' + typeof w)
}
export const isList = (f) => Array.isArray(f)
export const is_list = (f) => isList(f) | 0
const symbolMeta = Symbol.for('wuns-meta')
export const wordWithMeta = (s, meta) => {
  const w = new Word(s)
  w[symbolMeta] = meta
  return Object.freeze(w)
}
export const listWithMeta = (l, meta) => {
  const ll = [...l]
  ll[symbolMeta] = meta
  return Object.freeze(ll)
}
export const meta = (form) => {
  if (symbolMeta in form) return form[symbolMeta]
  return unit
}

export const print = (x) => {
  if (isWord(x)) return wordValue(x)
  if (!Array.isArray(x)) throw new Error(`cannot print ${x} expected word or list ${typeof x} ${x.constructor}`)
  return `[${x.map(print).join(' ')}]`
}
const number = (f) => {
  if (!isWord(f)) throw new Error('expected word: ' + f)
  const s = wordValue(f)
  const n = Number(s)
  if (isNaN(n)) throw new Error('expected number, found: ' + s)
  if (!isSigned32BitInteger(n)) throw new Error('expected 32-bit signed integer, found: ' + s)
  // if (String(normalised) !== s) throw new Error('expected normalized integer, found: ' + s)
  return n
}

export const push = (ar, e) => {
  if (!Array.isArray(ar)) throw new Error('push expects array')
  if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
  ar.push(e)
  return unit
}
export const size = (a) => {
  if (isWord(a)) return String(a).length
  if (Array.isArray(a)) return a.length
  throw new Error('getLength expects word or list')
}
export const mutable_list = () => []
const assert = (b, s) => {
  if (!b) throw new Error(s)
}
export const at = (v, i) => {
  const len = size(v)
  const ni = number(i)
  assert(ni >= -len && ni < len, 'index out of bounds: ' + i + ' ' + len)
  if (isWord(v)) return String(v).at(ni).charCodeAt(0)
  const elem = v.at(ni)
  return elem
}
export const freeze = (ar) => {
  if (!Array.isArray(ar)) throw new Error('freeze expects array')
  if (Object.isFrozen(ar)) throw new Error('freeze expects mutable array')
  return makeList(...ar)
}
export const slice = (v, i, j) => {
  if (!Array.isArray(v)) throw new Error('slice expects list')
  let s = v.slice(number(i), number(j))
  if (s instanceof Uint8Array) return makeList(...Array.from(s, (n) => n))
  return Object.freeze(s)
}
let gensymCounter = 0
export const gensym = () => word('v' + String(gensymCounter++))
export const set_array = (ar, index, e) => {
  if (!Array.isArray(ar)) throw new Error('set-array expects array')
  if (Object.isFrozen(ar)) throw new Error('set-array expects mutable array')
  const i = number(index)
  if (i < 0 || i >= ar.length) throw new Error('set-array index out of bounds: ' + i + ' ' + ar.length)
  ar[i] = e
  return unit
}
