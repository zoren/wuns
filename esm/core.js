import { isPlainObject, parseFunctionParameters } from './utils.js'

export const langUndefined = undefined

export const isSigned32BitInteger = (n) => (n | 0) === n

const wordRegex = /^[-./0-9a-zA-Z_]+$/
export const isWord = (s) => typeof s === 'string' && s.length > 0 && wordRegex.test(s)

export const emptyList = Object.freeze([])
export const arrayToList = (array) => (array.length === 0 ? emptyList : Object.freeze([...array]))
export const makeList = (...args) => arrayToList(args)
export const isList = (f) => Array.isArray(f)

export const isTaggedValue = (v) => v && typeof v === 'object' && 'tag' in v && 'args' in v
export const tryGetTag = (v) => (isTaggedValue(v) ? v.tag : null)
export const makeTaggedValue = (tag, ...args) => {
  if (typeof tag !== 'string') throw new Error('tag must be a string')
  return Object.freeze({ tag, args: Object.freeze(args) })
}
export const makeValueTagger = (tag, arity) => {
  return (...args) => {
    if (args.length !== arity) throw new Error(`'${tag}' expected ${arity} arguments, got ${args.length}`)
    return makeTaggedValue(tag, ...args)
  }
}

const formWordName = 'form/word'
const formListName = 'form/list'
export const makeFormWord = (w) => makeTaggedValue(formWordName, w)
export const makeFormList = (l) => makeTaggedValue(formListName, l)

export const optionNone = makeTaggedValue('option/none')
export const makeOptionSome = makeValueTagger('option/some', 1)

export const resultError = makeValueTagger('result/error', 1)
export const resultOk = makeValueTagger('result/ok', 1)

export const tryGetFormWord = (f) => (tryGetTag(f) === formWordName ? f.args[0] : null)

export const isForm = (f) => {
  let tag = tryGetTag(f)
  return tag === formWordName || tag === formListName
}

export const tryGetFormList = (f) => (tryGetTag(f) === formListName ? f.args[0] : null)
export const getFormChildren = (f) => {
  switch (tryGetTag(f)) {
    case formWordName:
      return emptyList
    case formListName:
      return f.args[0]
    default:
      throw new Error('getFormChildren expects form')
  }
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
    if (x === undefined) return '*js-undefined*'
    if (x === langUndefined) return '*wuns-undefined*'
    if (isList(x)) return `[${x.map(go).join(' ')}]`
    const word = tryGetFormWord(x)
    if (word) return go(word)
    const list = tryGetFormList(x)
    if (list) return go(list)
    if (isAtom(x)) return `[atom ${go(x.value)}]`
    if (isTaggedValue(x)) return `[${x.tag}${x.args.map((a) => ` ${go(a)}`).join('')}]`
    if (x instanceof Uint8Array) {
      const strings = []
      for (let i = 0; i < x.length; i++) strings.push(` ${x[i]}`)
      return `[bytes${strings.join('')}]`
    }
    const t = typeof x
    // todo allow t === 'boolean' too
    if (t === 'number' || t === 'bigint') return String(x)
    if (t === 'string') return isWord(x) ? x : x.indexOf("'") < 0 ? `'${x}'` : `"${x}"`
    if (t === 'function') return `[fn ${x.name}]`
    if (x instanceof Map) return `[transient-kv-map${[...x].map(([k, v]) => ` ${go(k)} ${go(v)}`).join('')}]`
    if (x instanceof Set) return `[set${[...x].map((e) => ` ${go(e)}`).join('')}]`
    if (Object.getPrototypeOf(x) === null) return x.toString()
    if (!isPlainObject(x)) return String(x)
    if (Object.isFrozen(x))
      return `[kv-map${Object.entries(x)
        .map(([k, v]) => ` ${k} ${go(v)}`)
        .join('')}]`
    return `[object${Object.entries(x)
      .map(([k, v]) => ` ${k} ${go(v)}`)
      .join('')}]`
  }
  return go(ox)
}

export const printFormMessage = (message) => {
  const word = tryGetFormWord(message)
  if (word) return print(word)
  const list = tryGetFormList(message)
  if (list) return list.map(print).join(' ')
  throw new Error('printMessage expects a form')
}

const parsedForms = new WeakMap()

export const tryGetFormInfo = (form) => parsedForms.get(form)

export const tryGetFormInfoRec = (form) => {
  const info = tryGetFormInfo(form)
  if (info) return info
  const list = tryGetFormList(form)
  if (!list) return null
  for (const f of list) {
    const info = tryGetFormInfoRec(f)
    if (info) return info
  }
}

const getPositionFromContentOffset = (content, byteOffset) => {
  let row = 0,
    column = 0
  for (let i = 0; i < byteOffset; i++) {
    if (content[i] === '\n') {
      row++
      column = 0
    } else {
      column++
    }
  }
  return { row, column }
}

export const getFormInfoAsRange = ({ contentObj, byteOffset, endOffset }) => {
  const { content } = contentObj
  return {
    start: getPositionFromContentOffset(content, byteOffset),
    end: getPositionFromContentOffset(content, endOffset),
  }
}

export const getFormInfoContentName = (formInfo) => formInfo.contentObj.contentName

export const getPosition = ({ contentObj, byteOffset }) => {
  const { content } = contentObj
  return getPositionFromContentOffset(content, byteOffset)
}

export const getFormPositionAsString = (formInfo) => {
  if (typeof formInfo === 'string') return formInfo
  const { row, column } = getPosition(formInfo)
  return `${formInfo.contentObj.contentName}:${row + 1}:${column + 1}`
}

class LineComment {
  constructor(content) {
    this.content = content
  }
}
const makeLineComment = (content) => Object.freeze(new LineComment(content))

export const parseString = (content, contentName, includeLineComments = false) => {
  const len = content.length
  let i = 0
  const offsetAsString = (offset) => {
    const { row, column } = getPositionFromContentOffset(content, offset)
    return `${contentName}:${row + 1}:${column + 1}`
  }
  const contentObj = { content, contentName }
  const registerForm = (form, byteOffset) => {
    parsedForms.set(form, { contentObj, byteOffset, endOffset: i })
    return form
  }
  const done = () => i >= len
  const go = () => {
    if (done()) return null
    let startIndex = i
    let c = content[i++]
    while (c === ' ' || c === '\n') {
      if (done()) return null
      c = content[i++]
      startIndex++
    }
    switch (c) {
      case ';': {
        const startComment = i
        while (i < len && content[i] !== '\n') i++
        if (!includeLineComments) return go()
        return registerForm(makeLineComment(content.slice(startComment, i)), startIndex)
      }
      case '[': {
        const list = []
        while (true) {
          if (done()) {
            console.warn('missing closing bracket: ' + offsetAsString(startIndex))
            return registerForm(makeFormList(Object.freeze(list)), startIndex)
          }
          const element = go()
          if (element === null) return registerForm(makeFormList(Object.freeze(list)), startIndex)
          list.push(element)
        }
      }
      case ']':
        return null
      case "'":
      case '"': {
        const startQuote = c
        while (i < len) {
          let c = content[i++]
          let cc = c.charCodeAt(0)
          if (cc >= 127) throw new Error('non-printable ascii character in string: ' + offsetAsString(i - 1))
          if (c === startQuote) return registerForm(makeFormWord(content.slice(startIndex + 1, i - 1)), startIndex)
          if (c === '\n') {
            console.warn('missing closing quote: ' + offsetAsString(startIndex))
            return registerForm(makeFormWord(content.slice(startIndex + 1, i - 1)), startIndex)
          }
          if (cc < 32) throw new Error('control character in string: ' + offsetAsString(i - 1))
        }
        return registerForm(makeFormWord(content.slice(startIndex + 1, i)), startIndex)
      }
      default:
        if (!isWord(c)) console.error(`illegal character: ${c} at ${offsetAsString(i - 1)}`)
        while (i < len && isWord(content[i])) i++
        return registerForm(makeFormWord(content.slice(startIndex, i)), startIndex)
    }
  }
  const forms = []
  while (!done()) {
    const form = go()
    if (form !== null) {
      forms.push(form)
    } else {
      if (!done()) console.warn('extra closing bracket: ' + offsetAsString(i))
    }
  }
  return forms
}

class Closure extends Function {
  constructor(f, kind, paramEnvMaker, body) {
    f.kind = kind
    f.paramEnvMaker = paramEnvMaker
    f.body = body
    // https://stackoverflow.com/questions/36871299/how-to-extend-function-with-es6-classes
    return Object.setPrototypeOf(f, new.target.prototype)
  }
}

export const makeClosure = (f, kind, paramEnvMaker, body) => Object.freeze(new Closure(f, kind, paramEnvMaker, body))
export const tryGetClosureKind = (v) => (v instanceof Closure ? v.kind : null)

export const checkArity = (fn, args) => {
  if (typeof fn !== 'function') throw new Error('apply expects function')
  if (!Array.isArray(args)) throw new Error('apply expects array')
  const arity = fn.length
  const jsParameterNames = parseFunctionParameters(fn)
  if (jsParameterNames.length && jsParameterNames.at(-1).startsWith('...')) {
    if (args.length < jsParameterNames.length - 1) throw new Error('apply expects more arguments')
  } else {
    if (arity !== args.length)
      throw new Error(`apply expects same number of arguments to: ${fn.name} expected ${arity} but got ${args.length}`)
  }
}

export const wordToI32 = (w) => {
  const v = +w
  if (isNaN(v)) throw new Error('expected number')
  if (!Number.isInteger(v)) throw new Error('expected integer')
  if (v < -2147483648) throw new Error('expected i32')
  if (v > 2 ** 32 - 1) throw new Error('expected i32')
  return v | 0
}

export const getLocationFromForm = (form) => {
  const formInfo = tryGetFormInfoRec(form)
  if (!formInfo) return 'no location'
  const { row, column } = getPosition(formInfo)
  return `${formInfo.contentObj.contentName}:${row + 1}:${column + 1}`
}
