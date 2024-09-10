import {
  isWord,
  isList,
  wordValue,
  isDefVar,
  meta,
  arrayToList,
  atom,
  isAtom,
  isSigned32BitInteger,
  print,
  formWord,
  isFormWord,
  formList,
  isFormList,
  tryGetFormWord,
  tryGetFormList,
} from './core.js'
import { isPlainObject } from './utils.js'

import { stringToWord } from './core.js'
export { stringToWord, wordValue }

export const apply = (fn, args) => {
  if (typeof fn !== 'function') throw new Error('apply expects function')
  return fn(...args)
}

// [func [word] form]
export const form_word = (w) => {
  if (!isWord(w)) throw new Error('form-word expects word')
  return formWord(w)
}

// [func [list [form]] form]
export const form_list = (l) => {
  if (!isList(l)) throw new Error('form-list expects list')
  if (isMutable(l)) throw new Error('form-list expects immutable list')
  if (isGrowable(l)) throw new Error('form-list expects frozen list')
  return formList(l)
}

export const form_to_word = (f) => {
  const w = tryGetFormWord(f)
  if (!w) throw new Error('form-to-word expects form-word')
  return w
}
export const try_get_form_word = (f) => {
  const w = tryGetFormWord(f)
  return w ? w : 0
}
export const form_to_list = (f) => {
  const l = tryGetFormList(f)
  if (!l) throw new Error('form-to-list expects form-list')
  return l
}
export const try_get_form_list = (f) => {
  const l = tryGetFormList(f)
  return l ? l : 0
}

export const is_word = (form) => isFormWord(form) | 0

export const is_list = (form) => isFormList(form) | 0
export { meta }

export const var_meta = (v) => {
  if (!isDefVar(v)) throw new Error('var-meta, not a defvar: ' + v)
  return meta(v)
}
export const var_get = (v) => {
  if (!isDefVar(v)) throw new Error('not a defvar: ' + v)
  return v.value
}
export const word_byte_size = (word) => {
  if (isWord(word)) return wordValue(word).length
  throw new Error('word-byte-size expects word, found: ' + word + ' ' + typeof word)
}

export const char_code_at = (word, index) => {
  const s = wordValue(word)
  if (!isSigned32BitInteger(index)) throw new Error('char-code-at expects number: ' + index)
  const len = s.length
  if (index < -len || index >= len) throw new Error('index out of bounds: ' + index + ' ' + len)
  return s.at(index).charCodeAt(0)
}
export const concat_words = (word_1, word_2) => stringToWord(wordValue(word_1) + wordValue(word_2))
// todo rename code_point_to_word
export const char_code_to_word = (code_point) => stringToWord(String.fromCodePoint(code_point))

export const size = (list) => {
  if (isList(list)) return list.length
  throw new Error('size expects list, found: ' + list + ' ' + typeof list)
}
const symbolListGrowable = Symbol.for('wuns-list-growable')
const symbolListMutable = Symbol.for('wuns-list-mutable')
const isGrowable = (l) => l[symbolListGrowable]
const isMutable = (l) => l[symbolListMutable]
export const growable_list = () => {
  const l = []
  l[symbolListGrowable] = true
  return l
}
export const clone_growable_to_frozen_list = (growable_list) => {
  if (!isList(growable_list)) throw new Error('clone-growable-to-frozen-list expects list')
  if (!isGrowable(growable_list)) throw new Error('clone-growable-to-frozen-list expects growable list')
  return arrayToList([...growable_list])
}
export const push = (growable_list, element) => {
  if (!isList(growable_list)) throw new Error('push expects array')
  if (!isGrowable(growable_list)) throw new Error('push expects growable list')
  if (Object.isFrozen(growable_list)) throw new Error('push expects mutable array')
  growable_list.push(element)
}
export const mutable_list_of_size = (size) => {
  if (size < 0) throw new Error('mutable-list-of-size expects non-negative size')
  const l = Array.from({ length: size }, () => undefined)
  l[symbolListMutable] = true
  return l
}

export const freeze_mutable_list = (mutable_list) => {
  if (!isList(mutable_list)) throw new Error('freeze-mutable-list expects array')
  if (!isMutable(mutable_list)) throw new Error('freeze-mutable-list expects mutable list')
  for (const v of mutable_list)
    if (v === undefined) throw new Error('freeze-mutable-list expects all elements to be set')
  delete mutable_list[symbolListMutable]
  Object.freeze(mutable_list)
}
export const set_array = (ar, index, element) => {
  if (!isList(ar)) throw new Error('set-array expects array')
  if (!isMutable(ar)) throw new Error('set-array expects mutable list')
  if (Object.isFrozen(ar)) throw new Error('set-array expects mutable array')
  if (!isSigned32BitInteger(index)) throw new Error('set-array expects integer index')
  if (index < 0 || index >= ar.length) throw new Error('set-array index out of bounds: ' + index + ' ' + ar.length)
  ar[index] = element
}
export const at = (list, index) => {
  if (!isList(list)) throw new Error('at expects list, got ' + typeof list + ' ' + list)
  if (!isSigned32BitInteger(index)) throw new Error('at expects number: ' + index)
  const len = list.length
  if (index < -len || index >= len) throw new Error('index out of bounds: ' + index + ' ' + len)
  return list.at(index)
}

export { atom }
export const is_atom = (atom) => isAtom(atom) | 0
export const atom_get = (atom) => {
  if (!isAtom(atom)) throw new Error('not an atom: ' + atom)
  return atom.value
}
export const atom_set = (atom, value) => {
  if (!isAtom(atom)) throw new Error('not an atom: ' + atom)
  atom.setValue(value)
}
export const is_identical = (value_a, value_b) => (value_a === value_b) | 0

export const transient_kv_map = () => ({})
export const has = (kv_map, key) => {
  if (!isPlainObject(kv_map)) throw new Error('has expects map')
  return (wordValue(key) in kv_map) | 0
}
export const get = (kv_map, key) => {
  if (!isPlainObject(kv_map)) throw new Error('get expects map')
  const ks = wordValue(key)
  if (ks in kv_map) return kv_map[ks]
  throw new Error(`key not found: ${ks} in [${Object.keys(kv_map)}]`)
}
// todo this is only used in assoc, for cloning, maybe consider refactoring, key ordering maybe become an issue as programs will rely on it
export const keys = (kv_map) => {
  if (!isPlainObject(kv_map)) throw new Error('keys expect map')
  return arrayToList(Object.keys(kv_map).map(stringToWord))
}
export const set_kv_map = (kv_map, key, value) => {
  if (!isPlainObject(kv_map)) throw new Error('set-kv-map expect map')
  if (Object.isFrozen(kv_map)) throw new Error('set-kv-map expects mutable object')
  kv_map[wordValue(key)] = value
}
export const freeze_kv_map = (kv_map) => {
  if (!isPlainObject(kv_map)) throw new Error('keys expect map')
  if (Object.isFrozen(kv_map)) throw new Error('freeze expects mutable object')
  Object.freeze(kv_map)
}

export const log = (form) => console.log(print(form))
export const concat_lists = (lists) => {
  const l = []
  for (const list of lists) {
    if (!isList(list)) throw new Error('concat expects list')
    l.push(...list)
  }
  return arrayToList(l)
}
export const concat = (l1, l2) => arrayToList([...l1, ...l2])
