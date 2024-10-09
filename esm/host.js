import {
  isWord,
  isList,
  wordValue,
  meta,
  arrayToList,
  atom,
  isAtom,
  isSigned32BitInteger,
  print,
  formWord,
  formList,
  stringToWord,
  makeTaggedValue
} from './core.js'

export const apply = (fn, args) => {
  if (typeof fn !== 'function') throw new Error('apply expects function')
  return fn(...args)
}

export const make_tagged_value = (tag, ...args) => {
  if (!isWord(tag)) throw new Error('make-tagged-value expects word')
  return makeTaggedValue(tag, ...args)
}

export const form_word = (w) => {
  if (!isWord(w)) throw new Error('form-word expects word')
  return formWord(w)
}
export const form_word_with_meta = (w, meta_data) => {
  if (!isWord(w)) throw new Error('form-word-with-meta expects word')
  return formWord(w, meta_data)
}
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

export const mutable_list_of_size = (size, init_value) => {
  if (size < 0) throw new Error('mutable-list-of-size expects non-negative size')
  const l = Array.from({ length: size }, () => init_value)
  l[symbolListMutable] = true
  return l
}
export const mutable_list_get = (mutable_list, index) => {
  if (!isList(mutable_list)) throw new Error('mutable-list-get expects list')
  if (!isMutable(mutable_list)) throw new Error('mutable-list-get expects mutable list')
  if (!isSigned32BitInteger(index)) throw new Error('mutable-list-get expects number: ' + index)
  if (index < 0 || index >= mutable_list.length)
    throw new Error('mutable-list-get index out of bounds: ' + index + ' ' + mutable_list.length)
  return mutable_list[index]
}

export const list_init_func = (size, func) => {
  if (size < 0) throw new Error('list-init-func expects non-negative size')
  if (typeof func !== 'function')
    throw new Error('list-init-func expects function was: ' + func + ' ' + typeof func + ' ' + func.constructor.name)
  const l = Array.from({ length: size }, (_, index) => func(index))
  return Object.freeze(l)
}
export const list_reverse = (list) => {
  if (!isList(list)) throw new Error('list-reverse expects list')
  return arrayToList([...list].reverse())
}
export const pairwise = (list) => {
  if (!isList(list)) throw new Error('pairwise expects list')
  const len = list.length
  const pairs = []
  for (let i = 0; i < len - 1; i += 2) pairs.push(arrayToList([list[i], list[i + 1]]))
  return arrayToList(pairs)
}
export const triplewise = (list) => {
  if (!isList(list)) throw new Error('triplewise expects list')
  const len = list.length
  const triples = []
  for (let i = 0; i < len - 2; i += 3) triples.push(arrayToList([list[i], list[i + 1], list[i + 2]]))
  return arrayToList(triples)
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
  if (!(kv_map instanceof Map)) throw new Error('get expects map')
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
export const concat_lists = (lists) => {
  const l = []
  for (const list of lists) {
    if (!isList(list)) throw new Error('concat expects list')
    l.push(...list)
  }
  return arrayToList(l)
}
export const concat = (l1, l2) => {
  if (!isList(l1)) throw new Error('concat expects frozen list')
  if (!isList(l2)) throw new Error('concat expects frozen list')
  return arrayToList([...l1, ...l2])
}
export const int_to_word = (i) => stringToWord(String(i))
export const slice = (list, start, end) => {
  if (!isList(list)) throw new Error('slice expects list')
  if (!isSigned32BitInteger(start)) throw new Error('slice expects number: ' + start)
  if (!isSigned32BitInteger(end)) throw new Error('slice expects number: ' + end)
  return arrayToList(list.slice(start, end))
}
export const byte_array = (size) => {
  if (!isSigned32BitInteger(size)) throw new Error('byte-array expects number: ' + size)
  if (size < 0) throw new Error('byte-array expects non-negative size')
  return new Uint8Array(size)
}
export const byte_array_size = (byte_array) => {
  if (!(byte_array instanceof Uint8Array)) throw new Error('byte-array-size expects byte array')
  return byte_array.length
}
export const byte_array_get = (byte_array, index) => {
  if (!(byte_array instanceof Uint8Array)) throw new Error('byte-array-get expects byte array')
  if (!isSigned32BitInteger(index)) throw new Error('byte-array-get expects number: ' + index)
  if (index < 0 || index >= byte_array.length)
    throw new Error('byte-array-get index out of bounds: ' + index + ' ' + byte_array.length)
  return byte_array[index]
}
export const byte_array_set = (byte_array, index, value) => {
  if (!(byte_array instanceof Uint8Array)) throw new Error('byte-array-set expects byte array')
  if (!isSigned32BitInteger(index)) throw new Error('byte-array-set expects number: ' + index)
  if (index < 0 || index >= byte_array.length)
    throw new Error('byte-array-set index out of bounds: ' + index + ' ' + byte_array.length)
  if (!isSigned32BitInteger(value)) throw new Error('byte-array-set expects number: ' + value)
  if (value < 0 || value > 255) throw new Error('byte-array-set expects byte: ' + value)
  byte_array[index] = value
}
export const byte_array_log_as_string = (byte_array) => {
  if (!(byte_array instanceof Uint8Array)) throw new Error('byte-array-log-as-string expects byte array')
  return console.log(String.fromCharCode(...byte_array))
}

import wabtProm from 'wabt'

const wabt = await wabtProm()

export const wat_to_byte_array = (inputBuffer) => {
  if (!(inputBuffer instanceof Uint8Array)) throw new Error('expects ArrayBuffer')
  const module = wabt.parseWat('', inputBuffer)
  module.resolveNames()
  module.validate()
  const { buffer } = module.toBinary({
    log: true,
    write_debug_names: true,
  })
  return buffer
}
export const byte_array_to_wasm_module = (buf) => new WebAssembly.Module(buf)
export const wasm_instantiate = (module) => new WebAssembly.Instance(module, {})
const emptyTuple = Object.freeze([])
export const wasm_call_export = (instance, export_name, args) => {
  if (!(instance instanceof WebAssembly.Instance)) throw new Error('expects instance')
  if (typeof export_name !== 'string') throw new Error('expects string')
  const { exports } = instance
  if (!(export_name in exports)) throw new Error('export not found: ' + export_name)
  const func = exports[export_name]
  if (typeof func !== 'function') throw new Error('export not a function: ' + export_name)
  if (!Array.isArray(args)) throw new Error('expects array')
  if (args.length !== func.length) throw new Error('parameter count mismatch')
  for (const arg of args) if (typeof arg !== 'number') throw new Error('expects number arguments')
  const res = func(...args)
  if (res === undefined) return emptyTuple
  if (!Array.isArray(res)) return Object.freeze([res])
  return Object.freeze(res)
}
