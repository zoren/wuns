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
export const arrayToList = (array) => (array.length === 0 ? emptyList : Object.freeze(array))
export const makeList = (...args) => arrayToList(args)
export const isList = (f) => Array.isArray(f)

export const listWithMeta = (l, meta) => {
  const ll = [...l]
  setMeta(ll, meta)
  return Object.freeze(ll)
}

class Form {}

export const isForm = (f) => f instanceof Form

class FormWord extends Form {
  #word
  constructor(word) {
    super()
    if (!isWord(word)) throw new Error('expected word')
    this.#word = word
  }

  get word() {
    return this.#word
  }

  toString() {
    return this.#word.toString()
  }
}

export const formWord = (word, metaData) => {
  const o = new FormWord(word)
  setMeta(o, metaData)
  return Object.freeze(o)
}

export const formWordFromString = (s) => formWord(word(s))

export const isFormWord = (f) => f instanceof FormWord

export const tryGetFormWord = (f) => (isFormWord(f) ? f.word : null)

class FormList extends Form {
  #list
  constructor(list) {
    super()
    if (!isList(list)) throw new Error('expected list')
    if (!Object.isFrozen(list)) throw new Error('expected frozen list')
    for (const f of list) if (!isForm(f)) throw new Error('expected form')
    this.#list = list
  }

  get list() {
    return this.#list
  }
}

export const formList = (list, metaData) => {
  const o = new FormList(list)
  setMeta(o, metaData)
  return Object.freeze(o)
}
const formListArgs = (...args) => formList(Object.freeze(args))

export const isFormList = (f) => f instanceof FormList

export const tryGetFormList = (f) => (isFormList(f) ? f.list : null)

export const formEquals = (a, b) => {
  if (a === b) return true
  const wa = tryGetFormWord(a), wb = tryGetFormWord(b)
  if (wa && wb) return wa.value === wb.value
  const la = tryGetFormList(a), lb = tryGetFormList(b)
  if (!la || !lb) return false
  if (la.length !== lb.length) return false
  for (let i = 0; i < la.length; i++) if (!formEquals(la[i], lb[i])) return false
  return true
}

class DefVar {
  #name
  #value
  constructor(name, value) {
    if (typeof name !== 'string') throw new Error('name must be string')
    if (value === undefined) throw new Error('value must be defined')
    this.#name = name
    this.#value = value
  }

  get name() {
    return this.#name
  }

  get value() {
    return this.#value
  }

  setValue(value) {
    this.#value = value
  }

  toString() {
    return `[var ${this.#name}]`
  }
}

export const isDefVar = (f) => f instanceof DefVar

export const defVar = (name, value) => new DefVar(name, value)

export const makeGetDefVarValue = (compile) => {
  const getDefVarValFn = (name) => compile(formListArgs(formWordFromString('try-get-var'), formWordFromString(name)))()
  return (name) => getDefVarValFn(name).value
}

class Atom {
  #value
  constructor(value) {
    this.#value = value
  }
  get value() {
    return this.#value
  }
  setValue(value) {
    this.#value = value
  }
}
export const atom = (v) => new Atom(v)
export const isAtom = (f) => f instanceof Atom

export const print = (ox) => {
  const go = (x) => {
    if (isWord(x)) return String(x)
    if (isList(x)) return `[${x.map(go).join(' ')}]`
    if (isFormWord(x)) return print(x.word)
    if (isFormList(x)) return print(x.list)
    if (x === undefined) return '*undefined*'
    if (isDefVar(x)) return `[var ${x.name}]`
    if (isAtom(x)) return `[atom ${go(x.value)}]`
    const t = typeof x
    // todo allow t === 'boolean' too
    if (t === 'number' || t === 'bigint') return String(x)
    if (t === 'string') return `'${x}'`
    if (t === 'function')
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
