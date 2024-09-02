export const isSigned32BitInteger = (n) => (n | 0) === n
const wordRegex = /^[a-z0-9.=/-]+$/
export const isWordString = (s) => typeof s === 'string' && s.length > 0 && wordRegex.test(s)
class Word {
  constructor(value) {
    if (!isWordString(value)) throw new Error('invalid word: "' + value + '" ' + typeof value)
    this.value = value
  }

  toString() {
    return this.value
  }
}
export const isWord = (f) => f instanceof Word
export const word = (s) => Object.freeze(new Word(s))
const symbolMeta = Symbol.for('wuns-meta')
export const meta = (form) => {
  const t = typeof form
  if ((t === 'object' || t === 'function') && symbolMeta in form) return form[symbolMeta]
  return 0
}
export const setMeta = (v, meta) => {
  const t = typeof v
  if (!(t === 'object' || t === 'function') || Object.isFrozen(v)) throw new Error('expects mutable object ' + t)
  if (meta === undefined) {
    delete v[symbolMeta]
    return
  }
  if (typeof meta !== 'object') throw new Error('meta must be object')
  v[symbolMeta] = Object.freeze({ ...meta })
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
export const arrayToList = (array) => (array.length === 0 ? emptyList : Object.freeze(array))
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

  setValue(value) {
    this.value = value
  }

  toString() {
    return `[var ${this.name}]`
  }
}

export const isDefVar = (f) => f instanceof DefVar

export const defVar = (name, value) => new DefVar(name, value)

export const makeGetDefVarValue = (compile) => {
  const getDefVarValFn = (name) => compile(makeList(word('try-get-var'), word(name)))()
  return (name) => getDefVarValFn(name).value
}

class Atom {
  constructor(value) {
    this.value = value
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
    if (typeof x === 'string') return `'${x}'`
    if (isList(x)) return `[${x.map(go).join(' ')}]`
    if (typeof x === 'function')
      return `[fn ${x.name} params [${x.parameters.join(' ')}${x.restParam ? ' .. ' + x.restParam : ''}]]`
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

import { isPlainObject } from './utils.js'

export const isRuntimeValue = (v) =>
  v === undefined ||
  isSigned32BitInteger(v) ||
  isWord(v) ||
  isAtom(v) ||
  isDefVar(v) ||
  typeof v === 'function' ||
  (isList(v) && v.every(isRuntimeValue)) ||
  (isPlainObject(v) && Object.keys(v).every(isWordString) && Object.values(v).every(isRuntimeValue))
