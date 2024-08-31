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

export const is_word = (f) => isWord(f)

export const is_list = (f) => isList(f)
export { meta }

export const word_with_meta = (w, meta_data) => wordWithMeta(wordValue(w), meta_data)
export const list_with_meta = (l, meta_data) => listWithMeta(l, meta_data)

export const var_meta = (v) => {
  if (!isDefVar(v)) throw new Error('var-meta, not a defvar: ' + v)
  return meta(v)
}
export const var_get = (v) => {
  if (!isDefVar(v)) throw new Error('not a defvar: ' + v)
  return v.value
}
export const word_byte_size = (w) => {
  if (isWord(w)) return wordValue(w).length
  throw new Error('word-byte-size expects word, found: ' + w + ' ' + typeof w)
}

export const char_code_at = (w, i) => {
  if (!isWord(w)) throw new Error('char-code-at expects word')
  if (!isSigned32BitInteger(i)) throw new Error('char-code-at expects number: ' + i)
  const len = wordValue(w).length
  if (i < -len || i >= len) throw new Error('index out of bounds: ' + i + ' ' + len)
  return String(w).at(i).charCodeAt(0)
}
export const concat_words = (w1, w2) => word(wordValue(w1) + wordValue(w2))
export const char_code_to_word = (cp) => word(String.fromCodePoint(cp))

export const size = (a) => {
  if (isList(a)) return a.length
  throw new Error('size expects list, found: ' + a + ' ' + typeof a)
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
export const clone_growable_to_frozen_list = (l) => {
  if (!isList(l)) throw new Error('freeze-growable-list expects list')
  if (!isGrowable(l)) throw new Error('freeze-growable-list expects growable list')
  return makeList(...l)
}
export const push = (ar, e) => {
  if (!isList(ar)) throw new Error('push expects array')
  if (!isGrowable(ar)) throw new Error('push expects growable list')
  if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
  ar.push(e)
}
export const mutable_list_of_size = (size) => {
  if (size < 0) throw new Error('mutable-list-of-size expects non-negative size')
  const l = Array.from({ length: size }, () => 0)
  l[symbolListMutable] = true
  return l
}

export const freeze_mutable_list = (l) => {
  if (!isList(l)) throw new Error('freeze-mutable-list expects array')
  if (!isMutable(l)) throw new Error('freeze-mutable-list expects mutable list')
  delete l[symbolListMutable]
  Object.freeze(l)
}
export const set_array = (ar, i, e) => {
  if (!isList(ar)) throw new Error('set-array expects array')
  if (!isMutable(ar)) throw new Error('set-array expects mutable list')
  if (Object.isFrozen(ar)) throw new Error('set-array expects mutable array')
  if (!isSigned32BitInteger(i)) throw new Error('set-array expects integer index')
  if (i < 0 || i >= ar.length) throw new Error('set-array index out of bounds: ' + i + ' ' + ar.length)
  ar[i] = e
}
export const at = (v, i) => {
  if (!isList(v)) throw new Error('at expects list, got ' + typeof v + ' ' + v)
  if (!isSigned32BitInteger(i)) throw new Error('at expects number: ' + i)
  const len = v.length
  if (i < -len || i >= len) throw new Error('index out of bounds: ' + i + ' ' + len)
  return v.at(i)
}

export { atom }
export const is_atom = (a) => isAtom(a)
export const atom_get = (a) => {
  if (!isAtom(a)) throw new Error('not an atom: ' + a)
  return a.value
}
export const atom_set = (a, v) => {
  if (!isAtom(a)) throw new Error('not an atom: ' + a)
  a.value = v
}
export const is_identical = (a, b) => a === b

// https://stackoverflow.com/a/69745650/3495920
const isPlainObject = (value) => value?.constructor === Object

export const transient_kv_map = () => ({})
export const has = (m, k) => {
  if (!isPlainObject(m)) throw new Error('has expects map')
  return wordValue(k) in m
}
export const get = (m, k) => {
  if (!isPlainObject(m)) throw new Error('get expects map')
  const ks = wordValue(k)
  if (ks in m) return m[ks]
  throw new Error(`key not found: ${ks} in [${Object.keys(m)}]`)
}
export const keys = (m) => {
  if (!isPlainObject(m)) throw new Error('keys expect map')
  return makeList(...Object.keys(m).map(word))
}
export const set_kv_map = (kv_map, key, value) => {
  if (!isPlainObject(kv_map)) throw new Error('set expect map')
  if (Object.isFrozen(kv_map)) throw new Error('set expects mutable object')
  kv_map[wordValue(key)] = value
}
// todo remove this
export const delete_key = (o, k) => {
  if (!isPlainObject(o)) throw new Error('delete-key expect map')
  if (Object.isFrozen(o)) throw new Error('delete expects mutable object')
  delete o[wordValue(k)]
}
export const freeze_kv_map = (o) => {
  if (!isPlainObject(o)) throw new Error('keys expect map')
  if (Object.isFrozen(o)) throw new Error('freeze expects mutable object')
  Object.freeze(o)
}

export const log = (x) => console.log(print(x))
export const concat = (...lists) => {
  const l = []
  for (const list of lists) {
    if (!isList(list)) throw new Error('concat expects list')
    l.push(...list)
  }
  return l
}
