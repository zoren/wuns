import {
  isClosure,
  unit,
  isWord,
  isList,
  word,
  wordValue,
  wordWithMeta,
  listWithMeta,
  meta,
  print,
  isSigned32BitInteger,
  makeList,
  atom,
  is_atom,
  atom_get,
  atom_set,
  number,
  isVar,
  varWithMeta,
  setMeta,
} from './core.js'

export const is_word = (f) => isWord(f)

export const is_i32 = (f) => isWord(f) && isSigned32BitInteger(Number(wordValue(f)))

export const is_list = (f) => isList(f)

export const is_fn = (f) => typeof f === 'function' || isClosure(f)

export const eq_word = (a, b) => isWord(a) && isWord(b) && (a === b || wordValue(a) === wordValue(b))

export const eq_list = (a, b) => isList(a) && isList(b) && (a === b || a.every((e, i) => eq_form(e, b[i])))

export const eq_form = (a, b) => eq_word(a, b) || eq_list(a, b)

export const with_meta = (f, meta) => {
  if (isWord(f)) return wordWithMeta(wordValue(f), meta)
  if (isList(f)) return listWithMeta(f, meta)
  if (isVar(f)) return varWithMeta(f, meta)
  throw new Error('with-meta expects word or list')
}
export { meta }
export const set_meta = (v, meta) => setMeta(v, meta)

export const size = (a) => {
  if (isWord(a)) return String(a).length
  if (Array.isArray(a)) return a.length
  throw new Error('size expects word or list found: ' + a + ' ' + typeof a)
}
export const push = (ar, e) => {
  if (!Array.isArray(ar)) throw new Error('push expects array')
  if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
  ar.push(e)
  return unit
}
export const list = (...args) => makeList(...args)
list.varargs = true

export const mutable_list = (...args) => args
mutable_list.varargs = true
export const mutable_list_of_size = (size) => {
  const s = number(size)
  if (s < 0) throw new Error('mutable-list-of-size expects non-negative size')
  const zeroWord = word('0')
  return Array.from({ length: s }, () => zeroWord)
}
export const is_mutable = (f) => (Array.isArray(f) && !Object.isFrozen(f)) | 0
export const list_from_mutable = (f) => {
  if (!Array.isArray(f)) throw new Error('list-from-mutable expects array')
  return makeList(...f)
}

export const persistent_array = (o) => {
  if (!Array.isArray(o)) throw new Error('persistent-array expects array')
  return makeList(...o)
}
export const persistent_kv_map = (o) => {
  if (!o || typeof o !== 'object') throw new Error('persistent-object expects object')
  const clone = { ...o }
  return Object.freeze(clone)
}
export const set_array = (ar, index, e) => {
  if (!Array.isArray(ar)) throw new Error('set-array expects array')
  if (Object.isFrozen(ar)) throw new Error('set-array expects mutable array')
  const i = number(index)
  if (i < 0 || i >= ar.length) throw new Error('set-array index out of bounds: ' + i + ' ' + ar.length)
  ar[i] = e
  return unit
}
export const set = (o, k, e) => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('set expects map')
  if (Object.isFrozen(o)) throw new Error('set expects mutable object')
  o[wordValue(k)] = e
  return unit
}
export const at = (v, i) => {
  if (!isList(v)) throw new Error('at expects list, got' + typeof v + ' ' + v)
  const len = size(v)
  const ni = number(i)
  if (ni < -len || ni >= len) throw new Error('index out of bounds: ' + i + ' ' + len)
  return v.at(ni)
}
export const at_word = (v, i) => {
  if (!isWord(v)) throw new Error('at-word expects word')
  const len = size(v)
  const ni = number(i)
  if (ni < -len || ni >= len) throw new Error('index out of bounds: ' + i + ' ' + len)
  return String(v).at(ni).charCodeAt(0)
}
export const slice = (v, i, j) => {
  if (!Array.isArray(v)) throw new Error('slice expects list')
  let s = v.slice(number(i), number(j))
  return makeList(...s)
}
export const abort = () => {
  throw new Error('abort')
}
export const codepoint_to_word = (cp) => word(String.fromCodePoint(number(cp)))
export const concat_words = (l) => word(l.map(wordValue).join(''))
export const log = (form) => {
  console.log(print(form))
  return unit
}

export const report_error = (msg, form) => {
  console.error(msg.map(print).join(' '), print(form))
  return unit
}
export { atom, is_atom, atom_get, atom_set }
export const concat_lists = (l) => {
  if (!Array.isArray(l)) throw new Error('concat-lists expects list')
  const result = []
  for (const e of l) {
    if (!Array.isArray(e)) throw new Error('concat-lists expects list of lists')
    result.push(...e)
  }
  return makeList(...result)
}
export const concat = (...lists) => concat_lists(lists)
concat.varargs = true
export const transient_kv_map = (...entries) => {
  if (entries.length % 2 !== 0) throw new Error('transient-kv-map expects even number of arguments')
  const map = {}
  for (let i = 0; i < entries.length; i += 2) map[wordValue(entries[i])] = entries[i + 1]
  return map
}
transient_kv_map.varargs = true
export const assoc = (m, k, v) => {
  if (typeof m !== 'object' || !Object.isFrozen(m)) throw new Error('assoc expects frozen map')
  return Object.freeze({ ...m, [wordValue(k)]: v })
}
export const has = (m, k) => {
  if (typeof m !== 'object') throw new Error('has expects map')
  return wordValue(k) in m
}

export const get = (m, k) => {
  if (typeof m !== 'object') throw new Error('get expects map')
  const ks = wordValue(k)
  if (ks in m) return m[ks]
  throw new Error('key not found: ' + ks + ' in ' + Object.keys(m))
}

import fs from 'fs'
import { parseStringToForms } from './parseTreeSitter.js'
export const read_file = (path) => {
  const p = wordValue(path)
  if (typeof p !== 'string') throw new Error('read-file expects string')
  return parseStringToForms(fs.readFileSync(p, 'utf8'))
}
