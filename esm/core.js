export const isSigned32BitInteger = (n) => (n | 0) === n
const wordRegex = /^[a-z0-9.=/-]+$/
export const isWordString = (s) => typeof s === 'string' && s.length > 0 && wordRegex.test(s)
class Word {
  constructor(value) {
    if (!isWordString(value)) throw new Error('invalid word: "' + value + '" ' + typeof value)
    this.value = value
  }

  toString() {
    return String(this.value)
  }
}
export const isWord = (f) => f instanceof Word
export const word = (s) => Object.freeze(new Word(s))
export const wordWithMeta = (s, meta) => {
  const w = new Word(s)
  w[symbolMeta] = meta
  return Object.freeze(w)
}
export const wordValue = (w) => {
  if (isWord(w)) return w.value
  throw new Error('not a word: ' + w + ' ' + typeof w)
}

const emptyList = Object.freeze([])
export const makeList = (...args) => (args.length === 0 ? emptyList : Object.freeze(args))
export const isList = (f) => Array.isArray(f)

export const isWunsFunction = (f) => f instanceof Function && Object.isFrozen(f) && 'funMacDesc' in f

const symbolMeta = Symbol.for('wuns-meta')
export const listWithMeta = (l, meta) => {
  const ll = [...l]
  ll[symbolMeta] = meta
  return Object.freeze(ll)
}

export const meta = (form) => {
  const t = typeof form
  if ((t === 'object' || t === 'function') && symbolMeta in form) return form[symbolMeta]
  return 0
}

export const print = (ox) => {
  const go = (x) => {
    if (x === undefined) throw new Error('undefined')
    if (isWord(x)) return String(x)
    if (typeof x === 'number') return String(x)
    if (typeof x === 'bigint') return String(x)
    if (Array.isArray(x)) return `[${x.map(go).join(' ')}]`
    if (isWunsFunction(x)) return `[fn ${x.funMacDesc.name} arity ${x.funMacDesc.params.length}]`
    if (typeof x === 'function') return `[extern-fn ${x.name} arity ${x.length}]`
    if (Object.isFrozen(x))
      return `[kv-map${Object.entries(x)
        .map(([k, v]) => ` ${k} ${go(v)}`)
        .join('')}]`
    return `[transient-kv-map${Object.entries(x)
      .map(([k, v]) => ` ${k} ${go(v)}`)
      .join('')}]`
  }
  return go(ox)
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
export const isAtom = (f) => f instanceof Atom
