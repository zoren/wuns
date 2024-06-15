export const isSigned32BitInteger = (n) => (n | 0) === n
const wordRegex = /^[a-z0-9.=/-]+$/
export const isWordString = (s) => typeof s === 'string' && s.length > 0 && wordRegex.test(s)
class Word {
  constructor(value) {
    if (isWordString(value)) {
      this.value = value
    } else throw new Error('invalid word: "' + value + '" ' + typeof value)
  }

  toString() {
    return String(this.value)
  }
}
export const word = (s) => Object.freeze(new Word(s))
// todo what about words representing large integers?
export const isWord = (f) => f instanceof Word
export const isForm = (f) => isWord(f) || (isList(f) && f.every(isForm))
export const wordValue = (w) => {
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
  if (typeof form === 'object' && symbolMeta in form) return form[symbolMeta]
  return unit
}

export const print = (x) => {
  if (isWord(x)) return String(x)
  if (typeof x === 'number') return String(x)
  if (Array.isArray(x)) return `[${x.map(print).join(' ')}]`
  if (Object.isFrozen(x)) return `[kv-map ${Object.entries(x).map(([k, v]) => `[quote ${k}] ${print(v)}`).join(' ')}]`
  if ('funMacDesc' in x) return `[closure ${x.funMacDesc.name}]`
  throw new Error('cannot print: ' + x)
}
export const unword = (v) => {
  if (isWord(v)) return wordValue(v)
  if (isList(v)) return makeList(...v.map(unword))
  throw new Error('quote expects word or list')
}
class Atom {
  constructor(value) {
    this.value = value
  }
  toString() {
    return print(this.value)
  }
}
export const atom = (v) => new Atom(v)
export const is_atom = (f) => f instanceof Atom
export const atom_get = (a) => {
  if (a instanceof Atom) return a.value
  throw new Error('not an atom: ' + a)
}
export const atom_set = (a, v) => {
  if (!(a instanceof Atom)) throw new Error('not an atom: ' + a)
  a.value = v
}
export const number = (arg) => {
  const wv = wordValue(arg)
  const n = Number(wv)
  if (!isSigned32BitInteger(n)) throw new Error(`expected 32-bit signed integer, found: ${wv}`)
  return n
}
