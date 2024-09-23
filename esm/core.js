export const isSigned32BitInteger = (n) => (n | 0) === n

const wordRegex = /^[a-z0-9.=/-]+$/
export const isWord = (s) => typeof s === 'string' && s.length > 0 && wordRegex.test(s)
export const stringToWord = (s) => {
  if (!isWord(s)) throw new Error('invalid word: "' + s + '" ' + typeof s)
  return s
}
export const wordValue = (w) => {
  if (!isWord(w)) {
    throw new Error(`expected word, got: '${w}' ${typeof w} ${w.constructor.name}`)
  }
  return w
}

const emptyList = Object.freeze([])
export const arrayToList = (array) => (array.length === 0 ? emptyList : Object.freeze([...array]))
export const makeList = (...args) => arrayToList(args)
export const isList = (f) => Array.isArray(f)

class TaggedValue {
  constructor(tag, ...args) {
    this.tag = tag
    this.args = Object.freeze(args)
  }
}

export const isTaggedValue = (v) => v instanceof TaggedValue
export const getTag = (v) => (isTaggedValue(v) ? v.tag : null)
export const makeTaggedValue = (tag, ...args) => Object.freeze(new TaggedValue(tag, ...args))
export const makeValueTagger = (tag, arity) => {
  const f = (...args) => {
    if (args.length !== arity) throw new Error(`'${tag}' expected ${arity} arguments, got ${args.length}`)
    return makeTaggedValue(tag, ...args);
  }
  f.tag = tag
  return f
}
export const makeTaggedValueMeta = (tag, meta, ...args) => {
  const tv = new TaggedValue(tag, ...args)
  setMeta(tv, meta)
  return Object.freeze(tv)
}
const formWordName = 'form/word'
const formListName = 'form/list'
export const formWord = (word, metaData) => makeTaggedValueMeta(formWordName, metaData, word)

export const tryGetFormWord = (f) => (getTag(f) === formWordName ? f.args[0] : null)

export const isForm = (f) => isTaggedValue(f) && (getTag(f) === formWordName || getTag(f) === formListName)

export const formList = (list, metaData) => {
  for (const f of list) if (!isForm(f)) throw new Error('expected all elements to be forms')
  return makeTaggedValueMeta(formListName, metaData, list)
}

export const tryGetFormList = (f) => (getTag(f) === formListName ? f.args[0] : null)

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

const symbolMeta = Symbol.for('wuns-meta')
export const meta = (v) => {
  // if (!isForm(v) && !isDefVar(v)) throw new Error('meta expects form or defvar')
  const t = typeof v
  if ((t === 'object' || t === 'function') && symbolMeta in v) return v[symbolMeta]
  return 0
}
export const setMeta = (v, meta) => {
  // if (!isForm(v) && !isDefVar(v)) throw new Error('setMeta expects form or defvar')
  const t = typeof v
  if (!(t === 'object' || t === 'function') || Object.isFrozen(v)) throw new Error('expects mutable object ' + t)
  if (meta === undefined) {
    delete v[symbolMeta]
    return
  }
  v[symbolMeta] = meta
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
    if (x === undefined) return '*undefined*'
    if (isList(x)) return `[${x.map(go).join(' ')}]`
    const word = tryGetFormWord(x)
    if (word) return go(word)
    const list = tryGetFormList(x)
    if (list) return go(list)
    if (isDefVar(x)) return `[var ${x.name}]`
    if (isAtom(x)) return `[atom ${go(x.value)}]`
    const t = typeof x
    // todo allow t === 'boolean' too
    if (t === 'number' || t === 'bigint') return String(x)
    if (t === 'string') return isWord(x) ? x : `'${x}'`
    if (t === 'function') return `[fn ${x.name}]`
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
