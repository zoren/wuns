import { isPlainObject } from './utils.js'

export const langUndefined = Symbol('undefined')

export const isSigned32BitInteger = (n) => (n | 0) === n

const wordRegex = /^[-./0-9a-z]+$/
export const isWord = (s) => typeof s === 'string' && s.length > 0 && wordRegex.test(s)
export const stringToWord = (s) => {
  if (!isWord(s)) throw new Error('invalid word: "' + s + '" ' + typeof s)
  return s
}
export const wordValue = (w) => {
  if (!isWord(w)) throw new Error(`expected word, got: '${w}' ${typeof w} ${w.constructor.name}`)
  return w
}

export const emptyList = Object.freeze([])
export const arrayToList = (array) => (array.length === 0 ? emptyList : Object.freeze([...array]))
export const makeList = (...args) => arrayToList(args)
export const isList = (f) => Array.isArray(f)

class TaggedValue {
  constructor(tag, ...args) {
    if (!isWord(tag)) throw new Error('tag must be a word')
    this.tag = tag
    this.args = Object.freeze(args)
  }
}

export const isTaggedValue = (v) => v instanceof TaggedValue
export const tryGetTag = (v) => (isTaggedValue(v) ? v.tag : null)
export const makeTaggedValue = (tag, ...args) => Object.freeze(new TaggedValue(tag, ...args))
export const makeValueTagger = (tag, arity) => {
  const f = (...args) => {
    if (args.length !== arity) throw new Error(`'${tag}' expected ${arity} arguments, got ${args.length}`)
    return makeTaggedValue(tag, ...args)
  }
  f.tag = tag
  return f
}

const formWordName = 'form/word'
const formListName = 'form/list'
export const optionNone = makeTaggedValue('option/none')
export const makeOptionSome = makeValueTagger('option/some', 1)

export const resultError = makeValueTagger('result/error', 1)
export const resultOk = makeValueTagger('result/ok', 1)

export const tryGetFormWord = (f) => (tryGetTag(f) === formWordName ? f.args[0] : null)

export const isForm = (f) => isTaggedValue(f) && (tryGetTag(f) === formWordName || tryGetTag(f) === formListName)

export const tryGetFormList = (f) => (tryGetTag(f) === formListName ? f.args[0] : null)

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

const recordTag = Symbol('record')
export const makeRecordFromObj = (type, fieldObj) => {
  const record = { ...fieldObj }
  record[recordTag] = type
  return Object.freeze(record)
}
export const makePair = (fst, snd) =>
  makeRecordFromObj('pair', {
    fst,
    snd,
  })

export const isRecord = (v) => v && v[recordTag]
export const getRecordType = (v) => v[recordTag]

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
    const recordTag = isRecord(x)
    if (recordTag)
      return `[record ${recordTag}${Object.entries(x)
        .map(([k, v]) => ` ${k} ${go(v)}`)
        .join('')}]`
    if (x instanceof Uint8Array) {
      const strings = []
      for (let i = 0; i < x.length; i++) strings.push(` ${x[i]}`)
      return `[bytes${strings.join('')}]`
    }
    const t = typeof x
    // todo allow t === 'boolean' too
    if (t === 'number' || t === 'bigint') return String(x)
    if (t === 'string') return isWord(x) ? x : `'${x}'`
    if (t === 'function') return `[fn ${x.name}]`
    if (x instanceof Map) return `[transient-kv-map${[...x].map(([k, v]) => ` ${go(k)} ${go(v)}`).join('')}]`
    if (x instanceof Set) return `[set${[...x].map((e) => ` ${go(e)}`).join('')}]`
    if (!isPlainObject(x)) return String(x)
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

import fs from 'node:fs'

import { parse } from './parseTreeSitter.js'
/**
 * @typedef {import('tree-sitter').TSParser} TSParser
 */

const formToNodeMap = new WeakMap()

export const tryGetNodeFromForm = (form) => formToNodeMap.get(form)

/**
 * @param {TSParser.Tree} tree
 * @returns { topForms: readonly TaggedValue[], formToNodeMap: Map<TaggedValue, TSParser.SyntaxNode> }
 */
export const treeToFormsSafeNoMeta = (tree) => {
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const tryNodeToForm = (node) => {
    const { isError, type } = node
    if (isError) return null
    switch (type) {
      case 'word': {
        const formWord = makeTaggedValue('form/word', node.text)
        formToNodeMap.set(formWord, node)
        return formWord
      }
      case 'list': {
        const formList = makeTaggedValue('form/list', childrenToList(node))
        formToNodeMap.set(formList, node)
        return formList
      }
      default:
        return null
    }
  }
  const childrenToList = (node) => {
    const childForms = []
    for (const child of node.namedChildren) {
      const subForm = tryNodeToForm(child)
      if (subForm) childForms.push(subForm)
    }
    return Object.freeze(childForms)
  }
  return childrenToList(tree.rootNode)
}

export const parseTagTreeSitter = (content, contentName) => {
  const tree = parse(content)
  tree.contentName = contentName
  return tree
}

export const readString = (content, contentName) => {
  const tree = parseTagTreeSitter(content, contentName)
  return arrayToList(treeToFormsSafeNoMeta(tree, contentName))
}

export const readFile = (filePath) => readString(fs.readFileSync(filePath, 'ascii'), filePath)

export const makeDefEnv = (currentDir) => {
  if (!currentDir) throw new Error('makeDefEnv expects currentDir')
  if (typeof currentDir !== 'string') throw new Error('currentDir must be a string')
  const defMap = new Map()
  defMap[defEnvTag] = true
  defMap.currentDir = currentDir
  return defMap
}
const defEnvTag = Symbol('def-env')
export const isDefEnv = (v) => v instanceof Map && v[defEnvTag]

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
export const isClosure = (v) => v instanceof Closure
