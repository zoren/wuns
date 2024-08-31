import {
  isWord,
  isList,
  word,
  wordValue,
  isDefVar,
  meta,
  makeList,
  atom,
  isAtom,
  isSigned32BitInteger,
  print,
  wordWithMeta,
  listWithMeta,
} from './core.js'

export const apply = (fn, args) => {
  if (typeof fn !== 'function') throw new Error('apply expects function')
  return fn(...args)
}

export const is_word = (form) => isWord(form)

export const is_list = (form) => isList(form)
export { meta }

export const word_with_meta = (word, meta_data) => wordWithMeta(wordValue(word), meta_data)
export const list_with_meta = (list, meta_data) => listWithMeta(list, meta_data)

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
  if (!isWord(word)) throw new Error('char-code-at expects word')
  if (!isSigned32BitInteger(index)) throw new Error('char-code-at expects number: ' + index)
  const len = wordValue(word).length
  if (index < -len || index >= len) throw new Error('index out of bounds: ' + index + ' ' + len)
  return String(word).at(index).charCodeAt(0)
}
export const concat_words = (word_1, word_2) => word(wordValue(word_1) + wordValue(word_2))
// todo rename
export const char_code_to_word = (code_point) => word(String.fromCodePoint(code_point))

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
  if (!isList(growable_list)) throw new Error('freeze-growable-list expects list')
  if (!isGrowable(growable_list)) throw new Error('freeze-growable-list expects growable list')
  return makeList(...growable_list)
}
export const push = (growable_list, element) => {
  if (!isList(growable_list)) throw new Error('push expects array')
  if (!isGrowable(growable_list)) throw new Error('push expects growable list')
  if (Object.isFrozen(growable_list)) throw new Error('push expects mutable array')
  growable_list.push(element)
}
export const mutable_list_of_size = (size) => {
  if (size < 0) throw new Error('mutable-list-of-size expects non-negative size')
  const l = Array.from({ length: size }, () => 0)
  l[symbolListMutable] = true
  return l
}

export const freeze_mutable_list = (mutable_list) => {
  if (!isList(mutable_list)) throw new Error('freeze-mutable-list expects array')
  if (!isMutable(mutable_list)) throw new Error('freeze-mutable-list expects mutable list')
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
export const is_atom = (atom) => isAtom(atom)
export const atom_get = (atom) => {
  if (!isAtom(atom)) throw new Error('not an atom: ' + atom)
  return atom.value
}
export const atom_set = (atom, value) => {
  if (!isAtom(atom)) throw new Error('not an atom: ' + atom)
  atom.value = value
}
export const is_identical = (value_a, value_b) => value_a === value_b

// https://stackoverflow.com/a/69745650/3495920
const isPlainObject = (value) => value?.constructor === Object

export const transient_kv_map = () => ({})
export const has = (kv_map, key) => {
  if (!isPlainObject(kv_map)) throw new Error('has expects map')
  return wordValue(key) in kv_map
}
export const get = (kv_map, key) => {
  if (!isPlainObject(kv_map)) throw new Error('get expects map')
  const ks = wordValue(key)
  if (ks in kv_map) return kv_map[ks]
  throw new Error(`key not found: ${ks} in [${Object.keys(kv_map)}]`)
}
export const keys = (kv_map) => {
  if (!isPlainObject(kv_map)) throw new Error('keys expect map')
  return makeList(...Object.keys(kv_map).map(word))
}
export const set_kv_map = (kv_map, key, value) => {
  if (!isPlainObject(kv_map)) throw new Error('set-kv-map expect map')
  if (Object.isFrozen(kv_map)) throw new Error('set-kv-map expects mutable object')
  kv_map[wordValue(key)] = value
}
export const freeze_kv_map = (o) => {
  if (!isPlainObject(o)) throw new Error('keys expect map')
  if (Object.isFrozen(o)) throw new Error('freeze expects mutable object')
  Object.freeze(o)
}

export const log = (form) => console.log(print(form))
export const concat = (...lists) => {
  const l = []
  for (const list of lists) {
    if (!isList(list)) throw new Error('concat expects list')
    l.push(...list)
  }
  return l
}
