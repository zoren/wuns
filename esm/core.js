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
const symbolMeta = Symbol.for('wuns-meta')
export const setMeta = (v, meta) => {
  if (typeof v !== 'object' || Object.isFrozen(v)) throw new Error('expects mutable object')
  v[symbolMeta] = meta
}
export const wordWithMeta = (s, meta) => {
  const w = new Word(s)
  setMeta(w, meta)
  return Object.freeze(w)
}
export const wordValue = (w) => {
  if (isWord(w)) return w.value
  throw new Error('not a word: ' + w + ' ' + typeof w)
}

const emptyList = Object.freeze([])
export const makeList = (...args) => (args.length === 0 ? emptyList : Object.freeze(args))
export const isList = (f) => Array.isArray(f)
export const isForm = (f) => isWord(f) || (isList(f) && f.every(isForm))

export const listWithMeta = (l, meta) => {
  const ll = [...l]
  setMeta(ll, meta)
  return Object.freeze(ll)
}

class DefVar {
  constructor(name, value) {
    if (typeof name !== 'string') throw new Error('name must be string')
    if (value === undefined) throw new Error('value must be defined')
    this.name = name
    this.value = value
  }

  toString() {
    return `[var ${this.name}]`
  }
}

export const isDefVar = (f) => f instanceof DefVar

export const defVar = (name, value) => Object.freeze(new DefVar(name, value))

export const defVarWithMeta = (name, value, metaData) => {
  const newVar = new DefVar(name, value)
  setMeta(newVar, metaData)
  return Object.freeze(newVar)
}

export const getDefVar = (defVars, name) => {
  if (!defVars.has(name)) throw new Error(`var not found: ${name}`)
  return defVars.get(name)
}

export const getDefVarValue = (defVars, name) => getDefVar(defVars, name).value

export const meta = (form) => {
  if (!isWord(form) && !isList(form) && !isDefVar(form)) throw new Error('meta expects word or list')
  const t = typeof form
  if (t === 'object' && symbolMeta in form) return form[symbolMeta]
  return 0
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

export const print = (ox) => {
  const go = (x) => {
    if (x === undefined) return '*undefined*'
    if (isDefVar(x)) return `[var ${x.name}]`
    if (isAtom(x)) return `[atom ${go(x.value)}]`
    if (isWord(x)) return String(x)
    if (typeof x === 'number') return String(x)
    if (typeof x === 'bigint') return String(x)
    if (isList(x)) return `[${x.map(go).join(' ')}]`
    if (typeof x === 'function') return `[fn ${x.name} arity ${x.length}]`
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
