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
  formList,
  setMeta,
  defVar,
  stringToWord,
} from './core.js'

export const apply = (fn, args) => {
  if (typeof fn !== 'function') throw new Error('apply expects function')
  return fn(...args)
}

// [func [word] form]
export const form_word = (w) => {
  if (!isWord(w)) throw new Error('form-word expects word')
  return formWord(w)
}
export const form_word_with_meta = (w, meta_data) => {
  if (!isWord(w)) throw new Error('form-word-with-meta expects word')
  return formWord(w, meta_data)
}
// [func [list [form]] form]
export const form_list = (l) => {
  if (!isList(l)) throw new Error('form-list expects list')
  if (isMutable(l)) throw new Error('form-list expects immutable list')
  return formList(l)
}
export const form_list_with_meta = (l, meta_data) => {
  if (!isList(l)) throw new Error('form-list-with-meta expects list')
  if (isMutable(l)) throw new Error('form-list-with-meta expects immutable list')
  return formList(l, meta_data)
}

export { meta }

export const var_meta = (v) => {
  if (!isDefVar(v)) throw new Error('var-meta, not a defvar: ' + v)
  return meta(v)
}
export const set_var_value_meta = (v, value, meta_data) => {
  if (!isDefVar(v)) throw new Error('not a defvar: ' + v)
  v.setValue(value)
  setMeta(v, meta_data)
}
export const def_var_with_meta = (name, value, meta_data) => {
  if (!isWord(name)) throw new Error('def-var-with-meta expects word')
  const v = defVar(name, value)
  setMeta(v, meta_data)
  return v
}
export const var_get = (v) => {
  if (!isDefVar(v)) throw new Error('not a defvar: ' + v)
  return v.value
}

export const word_byte_size = (word) => {
  if (isWord(word)) return wordValue(word).length
  throw new Error(`word-byte-size expects word, found: ${word} ${typeof word} ${word.constructor.name}`)
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

const symbolListMutable = Symbol.for('wuns-list-mutable')

const isMutable = (l) => l[symbolListMutable]

export const mutable_list_of_size = (size) => {
  if (size < 0) throw new Error('mutable-list-of-size expects non-negative size')
  const l = Array.from({ length: size }, () => undefined)
  l[symbolListMutable] = true
  return l
}

export const list_init_func = (size, func) => {
  if (size < 0) throw new Error('list-init-func expects non-negative size')
  if (typeof func !== 'function') throw new Error('list-init-func expects function was: ' + func + ' ' + typeof func + ' ' + func.constructor.name)
  const l = Array.from({ length: size }, (_, index) => func(index))
  return Object.freeze(l)
}
export const list_reverse = (list) => {
  if (!isList(list)) throw new Error('list-reverse expects list')
  return arrayToList([...list].reverse())
}
export const freeze_mutable_list = (mutable_list) => {
  if (!isList(mutable_list)) throw new Error('freeze-mutable-list expects array')
  if (!isMutable(mutable_list)) throw new Error('freeze-mutable-list expects mutable list')
  for (const v of mutable_list)
    if (v === undefined) throw new Error('freeze-mutable-list expects all elements to be set')
  delete mutable_list[symbolListMutable]
  const immutableList = Object.freeze(mutable_list)
  return immutableList
}
export const set_array = (mutable_list, index, element) => {
  if (!isList(mutable_list)) throw new Error('set-array expects array')
  if (!isMutable(mutable_list)) throw new Error('set-array expects mutable list')
  if (Object.isFrozen(mutable_list)) throw new Error('set-array expects mutable array')
  if (!isSigned32BitInteger(index)) throw new Error('set-array expects integer index')
  if (index < 0 || index >= mutable_list.length)
    throw new Error('set-array index out of bounds: ' + index + ' ' + mutable_list.length)
  mutable_list[index] = element
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

export const transient_kv_map = () => new Map()
export const has = (kv_map, key) => {
  if (!(kv_map instanceof Map)) throw new Error('has expects map')
  return kv_map.has(key) | 0
}
export const get = (kv_map, key) => {
  if (!(kv_map instanceof Map)) {
    console.dir({ kv_map, key })
    throw new Error('get expects map')}
  if (kv_map.has(key)) return kv_map.get(key)
  throw new Error(`key not found: ${key}`)
}
export const set_kv_map = (kv_map, key, value) => {
  if (!(kv_map instanceof Map)) throw new Error('set-kv-map expect map')
  kv_map.set(key, value)
}

export const log = (...forms) => {
  console.log(...forms.map(print))
}
const isFrozenList = (l) => isList(l) && Object.isFrozen(l) && !isMutable(l)
export const concat_lists = (lists) => {
  const l = []
  for (const list of lists) {
    if (!isFrozenList(list)) throw new Error('concat expects list')
    l.push(...list)
  }
  return arrayToList(l)
}
export const concat = (l1, l2) => {
  if (!isFrozenList(l1)) throw new Error('concat expects frozen list')
  if (!isFrozenList(l2)) throw new Error('concat expects frozen list')
  return arrayToList([...l1, ...l2])
}
export const int_to_word = (i) => stringToWord(String(i))
export const slice = (list, start, end) => {
  if (!isFrozenList(list)) throw new Error('slice expects list')
  if (!isSigned32BitInteger(start)) throw new Error('slice expects number: ' + start)
  if (!isSigned32BitInteger(end)) throw new Error('slice expects number: ' + end)
  return arrayToList(list.slice(start, end))
}
