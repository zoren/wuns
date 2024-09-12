import { wrapJSFunctionName } from './utils.js'

export const makeHost = () => {
  const simulatedMemory = ['this placeholder is to make 0 an invalid address']
  const alloc = (v) => {
    const addr = simulatedMemory.length
    simulatedMemory.push(v)
    return addr
  }
  const get = (addr) => {
    if (typeof addr !== 'number') throw new Error('address not a number')
    if (!Number.isInteger(addr)) throw new Error('not an integer')
    if (addr === 0) throw new Error('getting 0 pointer')
    if (addr < 0) throw new Error('out of bounds')
    if (simulatedMemory.length <= addr) throw new Error('out of bounds')
    return simulatedMemory[addr]
  }
  const stringToAddr = new Map()
  const stringToWord = (s) => {
    if (stringToAddr.has(s)) return stringToAddr.get(s)
    const addr = alloc(s)
    stringToAddr.set(s, addr)
    return addr
  }
  const numberToAddr = new Map()
  const numberToPointer = (n) => {
    if (numberToAddr.has(n)) return numberToAddr.get(n)
    const addr = alloc(n)
    numberToAddr.set(n, addr)
    return addr
  }
  const converters = { stringToWord, wordValue: get, numberToPointer, pointerValue: get }
  const hostDef = {
    'mutable-list-of-size': (size) => {
      const array = new Array(size)
      return alloc(Object.freeze({ type: 'mutable-list', array }))
    },
    'set-array': (mutable_list, index, value) => {
      const obj = get(mutable_list)
      if (obj.type !== 'mutable-list') throw new Error('set-array expects mutable-list')
      const { array } = obj
      array[index] = value
    },
    'freeze-mutable-list': (mutable_list) => {
      const obj = get(mutable_list)
      if (obj.type !== 'mutable-list') throw new Error('freeze-mutable-list expects mutable-list')
      const { array } = obj
      for (const v of array) if (v === undefined) throw new Error('freeze-mutable-list expects all elements to be set')
      Object.freeze(array)
      return alloc(Object.freeze({ type: 'list', array }))
    },

    'growable-list': () => {
      const array = []
      return alloc(Object.freeze({ type: 'growable-list', array }))
    },
    push: (growable_list, element) => {
      const lArray = get(growable_list)
      if (lArray.type !== 'growable-list') throw new Error('push expects growable-list')
      lArray.array.push(element)
    },
    'clone-growable-to-frozen-list': (growable_list) => {
      const lArray = get(growable_list)
      if (lArray.type !== 'growable-list') throw new Error('clone-growable-list-to-frozen-list expects growable-list')
      return alloc(Object.freeze({ type: 'list', array: [...lArray.array] }))
    },

    concat: (a, b) => {
      const aArray = get(a)
      if (aArray.type !== 'list') {
        console.log({ aArray })
        throw new Error('concat expects list')
      }
      const bArray = get(b)
      if (bArray.type !== 'list') throw new Error('concat expects list')
      return alloc(Object.freeze({ type: 'list', array: [...aArray.array, ...bArray.array] }))
    },
    'concat-lists': (lists) => {
      const listsObj = get(lists)
      if (listsObj.type !== 'list') throw new Error('concat-lists expects list of lists')
      const res = []
      for (const l of listsObj.array) {
        const lArray = get(l)
        if (lArray.type !== 'list') throw new Error('concat-lists expects list')
        res.push(...lArray.array)
      }
      return alloc(Object.freeze({ type: 'list', array: res }))
    },
    size: (l) => {
      const lArray = get(l)
      if (lArray.type !== 'list') throw new Error('size expects list')
      return lArray.array.length
    },
    at: (list, index) => {
      const lArray = get(list)
      if (lArray.type !== 'list') throw new Error('at expects list')
      return lArray.array.at(index)
    },

    'char-code-at': (word, index) => {
      const s = get(word)
      if (typeof s !== 'string') throw new Error('char-code-at expects word')
      const len = s.length
      if (index < -len || index >= len) throw new Error('index out of bounds: ' + index + ' ' + len)
      return s.at(index).charCodeAt(0)
    },
    'concat-words': (a, b) => {
      const aString = get(a)
      if (typeof aString !== 'string') throw new Error('concat-words expects word')
      const bString = get(b)
      if (typeof bString !== 'string') throw new Error('concat-words expects word')
      return stringToWord(aString + bString)
    },
    'char-code-to-word': (code_point) => {
      if (!Number.isInteger(code_point)) throw new Error('char-code-to-word expects integer')
      return stringToWord(String.fromCharCode(code_point))
    },
    'word-byte-size': (w) => {
      const s = get(w)
      if (typeof s !== 'string') throw new Error('word-byte-size expects word')
      return s.length
    },

    meta: (v) => {
      const obj = get(v)
      return obj.meta || 0
    },
    'var-meta': (v) => {
      const obj = get(v)
      if (obj.type !== 'def-var') throw new Error('var-meta expects def-var')
      return obj.meta || 0
    },
    'def-var-with-meta': (name, value, meta) => {
      const nameObj = get(name)
      if (typeof nameObj !== 'string') throw new Error('def-var-with-meta expects word')
      const obj = { type: 'def-var', name, value, meta }
      // console.log('def-var-with-meta', nameObj, obj)
      return alloc(obj)
    },
    'set-var-value-meta': (defVar, value, meta) => {
      const defVarObj = get(defVar)
      if (defVarObj.type !== 'def-var') throw new Error('set-var-value-meta expects def-var')
      defVarObj.value = value
      defVarObj.meta = meta
    },
    'var-get': (v) => {
      const obj = get(v)
      if (obj.type !== 'def-var') throw new Error('not a defvar: ' + v)
      return obj.value
    },

    'try-get-form-word': (f) => {
      const obj = get(f)
      const { type, value } = obj
      if (type !== 'form-word') return 0
      return value
    },
    'try-get-form-list': (f) => {
      const obj = get(f)
      const { type, value } = obj
      if (type !== 'form-list') return 0
      return get(value).array
    },

    'form-word': (w) => {
      if (typeof get(w) !== 'string') throw new Error('form-word expects word')
      // consider a pool of form words that don't have meta to avoid extra allocations
      return alloc(Object.freeze({ type: 'form-word', value: w }))
    },
    'form-word-with-meta': (w, m) => {
      if (typeof get(w) !== 'string') throw new Error('form-word-with-meta expects word')
      return alloc(Object.freeze({ type: 'form-word', value: w, meta: m }))
    },
    'form-list': (l) => {
      const lObj = get(l)
      if (lObj.type !== 'list') throw new Error('form-list expects list but got ' + lObj.type)
      return alloc(Object.freeze({ type: 'form-list', value: l }))
    },
    'form-list-with-meta': (l, m) => {
      const lObj = get(l)
      if (lObj.type !== 'list') throw new Error('form-list-with-meta expects list')
      return alloc(Object.freeze({ type: 'form-list', value: l, meta: m }))
    },

    'transient-kv-map': () => {
      const object = {}
      return alloc(Object.freeze({ type: 'kv-map', object }))
    },
    has: (m, k) => {
      const obj = get(m)
      if (obj.type !== 'kv-map') throw new Error('has expects kv-map')
      return obj.object.has(k)
    },
    get: (m, k) => {
      const obj = get(m)
      if (obj.type !== 'kv-map') throw new Error('get expects kv-map')
      return obj.object.get(k)
    },
    keys: (m) => {
      const obj = get(m)
      if (obj.type !== 'kv-map') throw new Error('keys expects kv-map')
      return Object.keys(obj.object)
    },
    'freeze-kv-map': (m) => {
      const obj = get(m)
      if (obj.type !== 'kv-map') throw new Error('freeze-kv-map expects kv-map')
      Object.freeze(obj.object)
    },
    'set-kv-map': (m, k, v) => {
      const obj = get(m)
      if (obj.type !== 'kv-map') throw new Error('set-kv-map expects kv-map')
      const { object } = obj
      if (Object.isFrozen(object)) throw new Error('set-kv-map expects mutable kv-map')
      object[k] = v
    },

    atom: (v) => {
      return alloc({ type: 'atom', value: v })
    },
    'is-atom': (v) => {
      const obj = get(v)
      return (obj.type === 'atom') | 0
    },
    'atom-get': (a) => {
      const obj = get(a)
      if (obj.type !== 'atom') throw new Error('not an atom: ' + a)
      return obj.value
    },
    'atom-set': (a, v) => {
      const obj = get(a)
      if (obj.type !== 'atom') throw new Error('not an atom: ' + a)
      obj.value = v
    },

    'is-identical': (a, b) => {
      get(a)
      get(b)
      return (a === b) | 0
    },

    log: (v) => {
      const go = (p) => {
        const obj = get(p)
        if (typeof obj === 'string') return obj
        if (obj.array) return `[${obj.array.map(go).join(' ')}]`
        if (typeof obj === 'object') {
          const { type, value } = obj
          switch (type) {
            case 'form-word':
              return go(value)
            case 'form-list':
              return go(value)
            case 'def-var':
              return `[var ${go(value)}]`
            default:
              throw new Error('unknown object type: ' + type)
          }
        }
        throw new Error('unknown object: ' + obj)
      }
      console.log(go(v))
    },
  }
  const host = {}
  for (const [dashedName, func] of Object.entries(hostDef)) {
    host[dashedName] = wrapJSFunctionName(dashedName, func)
  }
  return { host, converters }
}
