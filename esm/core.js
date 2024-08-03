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
export const zero = word('0')
export const one = word('1')
export const isForm = (f) => isWord(f) || (isList(f) && f.every(isForm))

export const unit = Object.freeze([])
export const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))
export const isUnit = (x) => x === unit || (Array.isArray(x) && Object.isFrozen(x) && x.length === 0)
export const isList = (f) => Array.isArray(f)

export const isWunsFunction = (f) => f instanceof Function && Object.isFrozen(f) && 'funMacDesc' in f

export const callFunctionStaged = (funMacDesc, numberOfGivenArgs) => {
  const { name, params, restParam } = funMacDesc
  const arity = params.length
  if (!restParam) {
    if (arity !== numberOfGivenArgs) throw new Error(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`)
    return (args) => {
      if (args.length !== numberOfGivenArgs) throw new Error('expected ' + numberOfGivenArgs + ' arguments')
      const varValues = new Map()
      for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
      return funMacDesc.cbodies({ varValues })
    }
  }
  if (arity > numberOfGivenArgs)
    throw new Error(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`)
  return (args) => {
    if (args.length !== numberOfGivenArgs) throw new Error('expected ' + numberOfGivenArgs + ' arguments')
    const varValues = new Map()
    for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
    varValues.set(restParam, makeList(...args.slice(arity)))
    return funMacDesc.cbodies({ varValues })
  }
}

export const callFunction = (funMacDesc, args) => callFunctionStaged(funMacDesc, args.length)(args)

export const createFunction = (funMacDesc) => {
  const fn = (...args) => callFunction(funMacDesc, args)
  fn['funMacDesc'] = funMacDesc
  return Object.freeze(fn)
}

const symbolMeta = Symbol.for('wuns-meta')
export const listWithMeta = (l, meta) => {
  const ll = [...l]
  ll[symbolMeta] = meta
  return Object.freeze(ll)
}

export const meta = (form) => {
  const t = typeof form
  if ((t === 'object' || t === 'function') && symbolMeta in form) return form[symbolMeta]
  return unit
}

export const print = (ox) => {
  const go = (x) => {
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
const isAtom = (f) => f instanceof Atom
export const atom_get = (a) => {
  if (!isAtom(a)) throw new Error('not an atom: ' + a)
  return a.value
}
export const atom_set = (a, v) => {
  if (!isAtom(a)) throw new Error('not an atom: ' + a)
  a.value = v
}
export const number = (arg) => {
  const wv = wordValue(arg)
  const n = Number(wv)
  if (!isSigned32BitInteger(n)) throw new Error(`expected 32-bit signed integer, found: ${wv}`)
  return n
}
