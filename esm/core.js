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

export const print = (ox) => {
  const visited = new Set()
  const go = (x) => {
    if (visited.has(x)) return '[*circular*]'
    visited.add(x)
    if (isWord(x)) return String(x)
    if (isVar(x)) return `[var ${x.name}]`
    if (typeof x === 'number') return String(x)
    if (Array.isArray(x)) return `[${x.map(go).join(' ')}]`
    if ('funMacDesc' in x) return `[closure ${x.funMacDesc.name}]`
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
class Var {
  constructor(name, value = null) {
    this.name = name
    this.value = value
  }
  isBound() {
    return this.value !== null
  }
  bind(value) {
    this.value = value
  }
  getValue() {
    if (this.value === null) throw new Error('unbound variable: ' + this.name)
    return this.value
  }
  toString() {
    return this.name
  }
}
export const makeVar = (name) => new Var(name)
export const varWithMeta = (v, meta) => {
  v[symbolMeta] = meta
  return v
}
export const isVar = (f) => f instanceof Var
export const setMeta = (v, meta) => {
  v[symbolMeta] = meta
  return v
}

export const callClosure = (closure, args) => {
  const { funMacDesc, closureEnv } = closure
  if (!funMacDesc) throw new RuntimeError('closure has no funMacDesc')
  const { name, params, restParam, cbodies } = funMacDesc
  const numberOfGivenArgs = args.length
  const arity = params.length
  const varValues = new Map()

  if (restParam === null) {
    if (arity !== numberOfGivenArgs) throw new Error(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`)
    for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
  } else {
    if (arity > numberOfGivenArgs)
      throw new Error(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`)
    for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
    varValues.set(restParam, makeList(...args.slice(arity)))
  }
  return cbodies({ varValues, outer: closureEnv })
}
