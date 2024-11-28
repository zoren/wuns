import {
  isWord,
  isList,
  wordValue,
  arrayToList,
  atom,
  isAtom,
  isSigned32BitInteger,
  print,
  stringToWord,
  parseString,
  tryGetFormInfoRec,
  optionNone,
  makeOptionSome,
  getFormPositionAsString,
} from '../core.js'

export const abort = (message) => {
  throw new Error('abort: ' + message.map((f) => print(f)).join(' '))
}

const parse_string = (content, content_name) => {
  if (typeof content !== 'string') throw new Error('parse-string expects string')
  if (typeof content_name !== 'string') throw new Error('parse-string expects string')
  return parseString(content, content_name)
}

export { parse_string as 'parse-string' }

const try_get_syntax_node = (form) => {
  const info = tryGetFormInfoRec(form)
  if (!info) return optionNone
  console.log({ info })
  return makeOptionSome(getFormPositionAsString(info))
}

export { try_get_syntax_node as 'try-get-syntax-node' }

const syntax_node_content_name = ({ contentObj }) => contentObj.contentName

export { syntax_node_content_name as 'syntax-node-content-name' }

// const get_syntax_node_location = ({ contentObj, byteOffset }) => {
//   // calculate row and column from byteOffset
//   const content = contentObj.content
//   for (let row = 0, column = 0, i = 0; i < byteOffset; i++) {
//     if (content[i] === '\n') {
//       row++
//       column = 0
//     } else {
//       column++
//     }
//   }
//   return makeRecordFromObj('syntax-node-location', { row, column })
// }

// export { get_syntax_node_location as 'get-syntax-node-location' }

const get_syntax_node_location_as_string = (info) => {
  return getFormPositionAsString(info)
}
export { get_syntax_node_location_as_string as 'get-syntax-node-location-as-string' }
export const apply = (fn, args) => {
  if (typeof fn !== 'function') throw new Error('apply expects function')
  if (!Array.isArray(args)) throw new Error('apply expects array')
  return fn(...args)
}

const word_byte_size = (word) => {
  if (isWord(word)) return wordValue(word).length
  throw new Error(`word-byte-size expects word, found: ${word} ${typeof word} ${word.constructor.name}`)
}
export { word_byte_size as 'word-byte-size' }

const char_code_at = (word, index) => {
  const s = wordValue(word)
  if (!isSigned32BitInteger(index)) throw new Error('char-code-at expects number: ' + index)
  const len = s.length
  if (index < -len || index >= len) throw new Error('index out of bounds: ' + index + ' ' + len)
  return s.at(index).charCodeAt(0)
}
export { char_code_at as 'char-code-at' }
const concat_words = (word_1, word_2) => stringToWord(wordValue(word_1) + wordValue(word_2))
export { concat_words as 'concat-words' }
// todo rename code_point_to_word
const char_code_to_word = (code_point) => stringToWord(String.fromCodePoint(code_point))
export { char_code_to_word as 'char-code-to-word' }
const code_points_to_word = (code_points) => stringToWord(String.fromCodePoint(...code_points))
export { code_points_to_word as 'code-points-to-word' }
export const size = (list) => {
  if (isList(list)) return list.length
  throw new Error('size expects list, found: ' + list + ' ' + typeof list)
}

const symbolListMutable = Symbol.for('wuns-list-mutable')

const isMutable = (l) => l[symbolListMutable]

const mutable_list_of_size = (size, init_value) => {
  if (size < 0) throw new Error('mutable-list-of-size expects non-negative size')
  const l = Array.from({ length: size }, () => init_value)
  l[symbolListMutable] = true
  return l
}
export { mutable_list_of_size as 'mutable-list-of-size' }
const mutable_list_get = (mutable_list, index) => {
  if (!isList(mutable_list)) throw new Error('mutable-list-get expects list')
  if (!isMutable(mutable_list)) throw new Error('mutable-list-get expects mutable list')
  if (!isSigned32BitInteger(index)) throw new Error('mutable-list-get expects number: ' + index)
  if (index < 0 || index >= mutable_list.length)
    throw new Error('mutable-list-get index out of bounds: ' + index + ' ' + mutable_list.length)
  return mutable_list[index]
}
export { mutable_list_get as 'mutable-list-get' }

const list_init_func = (size, func) => {
  if (size < 0) throw new Error('list-init-func expects non-negative size')
  if (typeof func !== 'function')
    throw new Error('list-init-func expects function was: ' + func + ' ' + typeof func + ' ' + func.constructor.name)
  const l = Array.from({ length: size }, (_, index) => func(index))
  return Object.freeze(l)
}
export { list_init_func as 'list-init-func' }
const list_reverse = (list) => {
  if (!isList(list)) throw new Error('list-reverse expects list')
  return arrayToList([...list].reverse())
}
export { list_reverse as 'list-reverse' }
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
const freeze_mutable_list = (mutable_list) => {
  if (!isList(mutable_list)) throw new Error('freeze-mutable-list expects array')
  if (!isMutable(mutable_list)) throw new Error('freeze-mutable-list expects mutable list')
  for (const v of mutable_list)
    if (v === undefined) throw new Error('freeze-mutable-list expects all elements to be set')
  delete mutable_list[symbolListMutable]
  const immutableList = Object.freeze(mutable_list)
  return immutableList
}
export { freeze_mutable_list as 'freeze-mutable-list' }
const set_array = (mutable_list, index, element) => {
  if (!isList(mutable_list)) throw new Error('set-array expects array')
  if (!isMutable(mutable_list)) throw new Error('set-array expects mutable list')
  if (Object.isFrozen(mutable_list)) throw new Error('set-array expects mutable array')
  if (!isSigned32BitInteger(index)) throw new Error('set-array expects integer index')
  if (index < 0 || index >= mutable_list.length)
    throw new Error('set-array index out of bounds: ' + index + ' ' + mutable_list.length)
  mutable_list[index] = element
}
export { set_array as 'set-array' }
export const at = (list, index) => {
  if (!isList(list)) throw new Error('at expects list, got ' + typeof list + ' ' + list)
  if (!isSigned32BitInteger(index)) throw new Error('at expects number: ' + index)
  const len = list.length
  if (index < -len || index >= len) throw new Error('index out of bounds: ' + index + ' ' + len)
  return list.at(index)
}

export { atom }
const is_atom = (atom) => isAtom(atom) | 0
export { is_atom as 'is-atom' }
const atom_get = (atom) => {
  if (!isAtom(atom)) throw new Error('not an atom: ' + atom)
  return atom.value
}
export { atom_get as 'atom-get' }
const atom_set = (atom, value) => {
  if (!isAtom(atom)) throw new Error('not an atom: ' + atom)
  atom.setValue(value)
}
export { atom_set as 'atom-set' }
const is_identical = (value_a, value_b) => (value_a === value_b) | 0
export { is_identical as 'is-identical' }
const transient_kv_map = () => new Map()
export { transient_kv_map as 'transient-kv-map' }
export const has = (kv_map, key) => {
  if (!(kv_map instanceof Map)) throw new Error('has expects map')
  return kv_map.has(key) | 0
}
export const get = (kv_map, key) => {
  if (!(kv_map instanceof Map)) throw new Error('get expects map')
  if (kv_map.has(key)) return kv_map.get(key)
  throw new Error(`key not found: ${key} in ${[...kv_map.keys()]}`)
}
const set_kv_map = (kv_map, key, value) => {
  if (!(kv_map instanceof Map)) throw new Error('set-kv-map expect map')
  kv_map.set(key, value)
}
export { set_kv_map as 'set-kv-map' }
const kv_map_size = (kv_map) => {
  if (!(kv_map instanceof Map)) throw new Error('kv-map-size expects map')
  return kv_map.size
}
export { kv_map_size as 'kv-map-size' }
const kv_map_values = (kv_map) => {
  if (!(kv_map instanceof Map)) throw new Error('kv-map-values expects map')
  return arrayToList([...kv_map.values()])
}
export { kv_map_values as 'kv-map-values' }

export { print }
const code_point_to_string = (code_point) => String.fromCodePoint(code_point)
export { code_point_to_string as 'code-point-to-string' }
// export const stdout_print = (v) => {
//   process.stdout.write(print(v))
// }
// export const stdout_write_code_point = (code_point) => {
//   if (typeof code_point !== 'number') throw new Error('stdout-write-code-point expects number')
//   process.stdout.write(String.fromCodePoint(code_point))
// }
const concat_lists = (lists) => {
  const l = []
  for (const list of lists) {
    if (!isList(list)) throw new Error('concat expects list')
    l.push(...list)
  }
  return arrayToList(l)
}
export { concat_lists as 'concat-lists' }
export const concat = (l1, l2) => {
  if (!isList(l1)) throw new Error('concat expects frozen list')
  if (!isList(l2)) throw new Error('concat expects frozen list')
  return arrayToList([...l1, ...l2])
}
const int_to_word = (i) => stringToWord(String(i))
export { int_to_word as 'int-to-word' }
const word_to_int = (word) => {
  if (!isWord(word)) throw new Error('word-to-int expects word')
  const i = +wordValue(word)
  if (Number.isNaN(i)) throw new Error('word-to-int expects integer')
  if (i < -2147483648 || i > 2147483647) throw new Error('word-to-int expects 32-bit integer')
  return i
}
export { word_to_int as 'word-to-int' }
export const slice = (list, start, end) => {
  if (!isList(list)) throw new Error('slice expects list')
  if (!isSigned32BitInteger(start)) throw new Error('slice expects number: ' + start)
  if (!isSigned32BitInteger(end)) throw new Error('slice expects number: ' + end)
  return arrayToList(list.slice(start, end))
}
const byte_array = (size) => {
  if (!isSigned32BitInteger(size)) throw new Error('byte-array expects number: ' + size)
  if (size < 0) throw new Error('byte-array expects non-negative size')
  return new Uint8Array(size)
}
export { byte_array as 'byte-array' }
const byte_array_size = (byte_array) => {
  if (!(byte_array instanceof Uint8Array)) throw new Error('byte-array-size expects byte array')
  return byte_array.length
}
export { byte_array_size as 'byte-array-size' }
const byte_array_get = (byte_array, index) => {
  if (!(byte_array instanceof Uint8Array)) throw new Error('byte-array-get expects byte array')
  if (!isSigned32BitInteger(index)) throw new Error('byte-array-get expects number: ' + index)
  if (index < 0 || index >= byte_array.length)
    throw new Error('byte-array-get index out of bounds: ' + index + ' ' + byte_array.length)
  return byte_array[index]
}
export { byte_array_get as 'byte-array-get' }
const byte_array_set = (byte_array, index, value) => {
  if (!(byte_array instanceof Uint8Array)) throw new Error('byte-array-set expects byte array')
  if (!isSigned32BitInteger(index)) throw new Error('byte-array-set expects number: ' + index)
  if (index < 0 || index >= byte_array.length)
    throw new Error('byte-array-set index out of bounds: ' + index + ' ' + byte_array.length)
  if (!isSigned32BitInteger(value)) throw new Error('byte-array-set expects number: ' + value)
  if (value < 0 || value > 255) throw new Error('byte-array-set expects byte: ' + value)
  byte_array[index] = value
}
export { byte_array_set as 'byte-array-set' }
const byte_array_log_as_string = (byte_array) => {
  if (!(byte_array instanceof Uint8Array)) throw new Error('byte-array-log-as-string expects byte array')
  return console.log(String.fromCharCode(...byte_array))
}
export { byte_array_log_as_string as 'byte-array-log-as-string' }

const growable_list = () => []
export { growable_list as 'growable-list' }
export const push = (growable_list, value) => {
  if (!Array.isArray(growable_list)) throw new Error('push expects array')
  growable_list.push(value)
}
const clone_growable_to_frozen_list = (growable_list) => {
  if (!Array.isArray(growable_list)) throw new Error('clone-growable-to-frozen-list expects array')
  return Object.freeze([...growable_list])
}
export { clone_growable_to_frozen_list as 'clone-growable-to-frozen-list' }

export const set = () => new Set()
const set_add = (set, value) => {
  if (!(set instanceof Set)) throw new Error('set-add expects set')
  set.add(value)
}
export { set_add as 'set-add' }
const set_has = (set, value) => {
  if (!(set instanceof Set)) throw new Error('set-has expects set')
  return set.has(value) | 0
}
export { set_has as 'set-has' }
const set_to_list = (set) => {
  if (!(set instanceof Set)) throw new Error('set-to-frozen-list expects set')
  return Object.freeze([...set])
}
export { set_to_list as 'set-to-list' }
const mem_dump = (wasmMem, start, end) => {
  if (!(wasmMem instanceof WebAssembly.Memory)) throw new Error('mem-dump expects memory')
  if (!isSigned32BitInteger(start)) throw new Error('mem-dump expects number: ' + start)
  if (!isSigned32BitInteger(end)) throw new Error('mem-dump expects number: ' + end)
  const { buffer } = wasmMem
  if (start < 0 || start >= buffer.byteLength)
    throw new Error('mem-dump start out of bounds: ' + start + ' ' + buffer.byteLength)
  if (end < 0 || end > buffer.byteLength)
    throw new Error('mem-dump end out of bounds: ' + end + ' ' + buffer.byteLength)
  if (start > end) throw new Error('mem-dump start is greater than end: ' + start + ' ' + end)
  const view = new Uint8Array(buffer)
  for (let i = start; i < end; i += 16) {
    console.log([...view.slice(i, i + 16)].map((n) => n.toString(16).padStart(2, '0')).join(' '))
  }
}
export { mem_dump as 'mem-dump' }