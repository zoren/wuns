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
  atom_get,
  atom_set,
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

export const size = (a) => {
  if (isWord(a)) return String(a).length
  if (Array.isArray(a)) return a.length
  throw new Error('size expects word or list found: ' + a + ' ' + typeof a)
}

export const char_code_at = (v, i) => {
  if (!isWord(v)) throw new Error('at-word expects word')
  if (!isSigned32BitInteger(i)) throw new Error('at-word expects number: ' + i)
  const len = size(v)
  if (i < -len || i >= len) throw new Error('index out of bounds: ' + i + ' ' + len)
  return String(v).at(i).charCodeAt(0)
}
// export const codepoint_to_word = (cp) => word(String.fromCodePoint(cp))
export const concat_words = (w1, w2) => word(wordValue(w1) + wordValue(w2))
export const int_to_word = (n) => word(n.toString())

const symbolListGrowable = Symbol.for('wuns-list-growable')
const symbolListMutable = Symbol.for('wuns-list-mutable')
const isGrowable = (l) => l[symbolListGrowable]
const isMutable = (l) => l[symbolListMutable]
export const mutable_list = () => {
  const l = []
  l[symbolListGrowable] = true
  return l
}
export const push = (ar, e) => {
  if (!isGrowable(ar)) throw new Error('push expects growable list')
  if (!Array.isArray(ar)) throw new Error('push expects array')
  if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
  ar.push(e)
}
export const mutable_list_of_size = (size) => {
  if (size < 0) throw new Error('mutable-list-of-size expects non-negative size')
  const l = Array.from({ length: size }, () => 0)
  l[symbolListMutable] = true
  return l
}
// export const is_mutable = (f) => (Array.isArray(f) && !Object.isFrozen(f)) | 0

export const persistent_array = (o) => {
  if (!Array.isArray(o)) throw new Error('persistent-array expects array')
  return makeList(...o)
}
export const set_array = (ar, i, e) => {
  if (!isMutable(ar)) throw new Error('set-array expects mutable list')
  if (!Array.isArray(ar)) throw new Error('set-array expects array')
  if (Object.isFrozen(ar)) throw new Error('set-array expects mutable array')
  if (!isSigned32BitInteger(i)) throw new Error('set-array expects integer index')
  if (i < 0 || i >= ar.length) throw new Error('set-array index out of bounds: ' + i + ' ' + ar.length)
  ar[i] = e
}
export const at = (v, i) => {
  if (!isList(v)) throw new Error('at expects list, got' + typeof v + ' ' + v)
  if (!isSigned32BitInteger(i)) throw new Error('at expects number: ' + i)
  const len = size(v)
  if (i < -len || i >= len) throw new Error('index out of bounds: ' + i + ' ' + len)
  return v.at(i)
}

export const slice = (v, i, j) => {
  if (!Array.isArray(v)) throw new Error('slice expects list')
  if (!isSigned32BitInteger(i)) throw new Error('slice expects number: ' + i)
  if (!isSigned32BitInteger(j)) throw new Error('slice expects number: ' + j)
  return makeList(...v.slice(i, j))
}

export { atom, atom_get, atom_set }
export const transient_kv_map = () => ({})
export const has = (m, k) => {
  if (typeof m !== 'object') throw new Error('has expects map')
  return (wordValue(k) in m) | 0
}
// https://stackoverflow.com/a/69745650/3495920
const isPlainObject = (value) => value?.constructor === Object
export const get = (m, k) => {
  if (!isPlainObject(m)) throw new Error('get expects map')
  const ks = wordValue(k)
  if (ks in m) return m[ks]
  throw new Error('key not found: ' + ks + ' in ' + Object.keys(m))
}
export const set = (o, k, e) => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('set expects map')
  if (Object.isFrozen(o)) throw new Error('set expects mutable object')
  o[wordValue(k)] = e
}
export const delete_key = (o, k) => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('delete-key expects map')
  if (Object.isFrozen(o)) throw new Error('delete expects mutable object')
  delete o[wordValue(k)]
}
export const keys = (m) => {
  if (!isPlainObject(m)) throw new Error('keys expect map')
  if (typeof m !== 'object') throw new Error('keys expects map')
  return makeList(...Object.keys(m).map(word))
}
export const persistent_kv_map = (o) => {
  if (!o || typeof o !== 'object') throw new Error('persistent-object expects object')
  const clone = { ...o }
  return Object.freeze(clone)
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
