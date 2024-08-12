import {
  isWord,
  isList,
  word,
  wordValue,
  wordWithMeta,
  listWithMeta,
  meta,
  print,
  makeList,
  atom,
  isAtom,
  isSigned32BitInteger,
} from './core.js'

export const is_word = (f) => isWord(f) | 0

export const is_list = (f) => isList(f) | 0

export const with_meta = (f, metaData) => {
  if (isWord(f)) return wordWithMeta(wordValue(f), metaData)
  if (isList(f)) return listWithMeta(f, metaData)
  throw new Error('with-meta expects word or list')
}
export { meta }

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
export const char_code_to_word = cp => word(String.fromCodePoint(cp))

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
  if (!isList(v)) throw new Error('at expects list, got' + typeof v + ' ' + v)
  if (!isSigned32BitInteger(i)) throw new Error('at expects number: ' + i)
  const len = v.length
  if (i < -len || i >= len) throw new Error('index out of bounds: ' + i + ' ' + len)
  return v.at(i)
}

export { atom }

export const atom_get = (a) => {
  if (!isAtom(a)) throw new Error('not an atom: ' + a)
  return a.value
}
export const atom_set = (a, v) => {
  if (!isAtom(a)) throw new Error('not an atom: ' + a)
  a.value = v
}

// https://stackoverflow.com/a/69745650/3495920
const isPlainObject = (value) => value?.constructor === Object

export const transient_kv_map = () => ({})
export const has = (m, k) => {
  if (!isPlainObject(m)) throw new Error('has expects map')
  return (wordValue(k) in m) | 0
}
export const get = (m, k) => {
  if (!isPlainObject(m)) throw new Error('get expects map')
  const ks = wordValue(k)
  if (ks in m) return m[ks]
  throw new Error('key not found: ' + ks + ' in ' + Object.keys(m))
}
export const keys = (m) => {
  if (!isPlainObject(m)) throw new Error('keys expect map')
  return makeList(...Object.keys(m).map(word))
}
export const set = (o, k, e) => {
  if (!isPlainObject(o)) throw new Error('set expect map')
  if (Object.isFrozen(o)) throw new Error('set expects mutable object')
  o[wordValue(k)] = e
}
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

export const log = (form) => {
  console.log(print(form))
}

// only for js host
export const object_get = (m, k) => {
  const ks = wordValue(k)
  if (ks in m) return m[ks]
  throw new Error('key not found: ' + ks + ' in ' + Object.keys(m))
}
export const object_keys = (m) => {
  if (typeof m !== 'object') throw new Error('keys expects map')
  return makeList(...Object.keys(m).map(word))
}
