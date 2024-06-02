export const isSigned32BitInteger = (n) => (n | 0) === n
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
export const wordValue = (w) => {
  if (isSigned32BitInteger(w)) return w
  if (typeof w === 'string') return w
  if (w instanceof Word) return w.value
  throw new Error('not a word: ' + w + ' ' + typeof w)
}

export const unit = Object.freeze([])
export const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))
export const isUnit = (x) => x === unit || (Array.isArray(x) && Object.isFrozen(x) && x.length === 0)
export const isList = (f) => Array.isArray(f)

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
  if (isWord(x)) return String(x)
  if (typeof x === 'number') return String(x)
  if (!Array.isArray(x)) throw new Error(`cannot print ${x} expected word or list ${typeof x} ${x.constructor}`)
  return `[${x.map(print).join(' ')}]`
}
export const unword = (v) => {
  if (isWord(v)) return wordValue(v)
  if (isList(v)) return makeList(...v.map(unword))
  throw new Error('quote expects word or list')
}

export let memArrayBuffer
let u8mem
export let i32mem
export let u32mem

export const defineMemory = (nOfPages) => {
  memArrayBuffer = new ArrayBuffer(nOfPages * 64 * 1024)
  u8mem = new Uint8Array(memArrayBuffer)
  i32mem = new Int32Array(memArrayBuffer)
  u32mem = new Uint32Array(memArrayBuffer)
  return memArrayBuffer
}
