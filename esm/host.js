import {
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
} from './core.js'

export const is_word = (f) => isWord(f) | 0

export const is_list = (f) => isList(f) | 0

export const with_meta = (f, meta) => {
  if (isWord(f)) return wordWithMeta(wordValue(f), meta)
  if (isList(f)) return listWithMeta(f, meta)
  throw new Error('with-meta expects word or list')
}
export { meta, word }

export const push = (ar, e) => {
  if (!Array.isArray(ar)) throw new Error('push expects array')
  if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
  ar.push(e)
  return unit
}
export const size = (a) => {
  if (isWord(a)) return String(a).length
  if (Array.isArray(a)) return a.length
  throw new Error('size expects word or list found: ' + a + ' ' + typeof a)
}
export const mutable_list = () => []
export const is_mutable = (f) => (Array.isArray(f) && !Object.isFrozen(f)) | 0

const number = (f) => {
  if (!isWord(f)) throw new Error('expected word: ' + f)
  const s = wordValue(f)
  const n = Number(s)
  if (isNaN(n)) throw new Error('expected number, found: ' + s)
  if (!isSigned32BitInteger(n)) throw new Error('expected 32-bit signed integer, found: ' + s)
  // if (String(normalised) !== s) throw new Error('expected normalized integer, found: ' + s)
  return n
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
// come up with a better name, the list is not frozen, a frozen copy is made
export const freeze = (ar) => {
  if (!Array.isArray(ar)) throw new Error('freeze expects array')
  if (Object.isFrozen(ar)) throw new Error('freeze expects mutable array')
  return makeList(...ar)
}
export const slice = (v, i, j) => {
  if (!Array.isArray(v)) throw new Error('slice expects list')
  let s = v.slice(number(i), number(j))
  if (s instanceof Uint8Array) return makeList(...Array.from(s, (n) => n))
  return makeList(...s)
}
export const set_array = (ar, index, e) => {
  if (!Array.isArray(ar)) throw new Error('set-array expects array')
  if (Object.isFrozen(ar)) throw new Error('set-array expects mutable array')
  const i = number(index)
  if (i < 0 || i >= ar.length) throw new Error('set-array index out of bounds: ' + i + ' ' + ar.length)
  ar[i] = e
  return unit
}
export const abort = () => {
  throw new Error('abort')
}
export const concat_words = (l) => {
  return word(
    l
      .map((w) => {
        const v = wordValue(w)
        if (typeof v === 'string') return v
        if (typeof v === 'number') return String(v)
        throw new Error('concat-words expects list of words')
      })
      .join(''),
  )
}
export const log = (form) => {
  console.log(print(form))
  return unit
}

export const context_eval = (context, form) => {
  const { evalFormCurrentModule } = context
  return evalFormCurrentModule(form)
}
export const context_macro_expand = (context, form) => {
  const { macroExpandCurrentModule } = context
  return macroExpandCurrentModule(form)
}
