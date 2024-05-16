const {
  wordString,
  number,
  meta,
  wordWithMeta,
  listWithMeta,
  print,
  word,
  isWord,
  isList,
  unit,
  makeList,
} = require('./core')

const instructions = {
  '===': '===',
  add: '+',
  sub: '-',
  mul: '*',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',
  eq: '===',
  'bitwise-and': '&',
}
const wunsWordToJSId = (w) => {
  if (!isWord(w)) throw new Error('expected word')
  const s = wordString(w)
  if (!/^[a-z0-9.=-]+$/.test(s)) throw new Error('invalid identifier: ' + s)
  return s.replace(/-/g, '_').replace(/=/g, 'EQ').replace(/\./g, 'DOT')
}
const jsDOMToJS = (l) => {
  if (isWord(l)) return wordString(l)
  if (!Array.isArray(l)) throw new Error('expected word or list')
  if (l.length === 0) return []
  const [first, ...rest] = l
  if (!isWord(first)) {
    console.error({ first })
    throw new Error('expected word')
  }
  const s = wordString(first)
  switch (s) {
    case 'value':
      return `${wordString(rest[0])} | 0`
    case 'var':
      return wunsWordToJSId(rest[0])
    case 'continue':
      return 'continue'
    case 'op': {
      const [name, ...args] = rest
      if (!isWord(name)) throw new Error('expected word')
      const n = wordString(name)
      const instr = instructions[n]
      if (!instr) throw new Error('unknown instruction: ' + n)
      if (args.length !== 2) throw new Error('expected 2 arguments')
      return `((${jsDOMToJS(args[0])}) ${instr} (${jsDOMToJS(args[1])})) | 0`
    }
    case 'call': {
      const [f, ...args] = rest
      if (!isWord(f)) return `(${jsDOMToJS(f)})(${args.map(jsDOMToJS).join(', ')})`
      return `${wunsWordToJSId(f)}(${args.map(jsDOMToJS).join(', ')})`
    }
    case 'string':
      return `'${wordString(rest[0])}'`
    case 'array':
      return `[${rest.map(jsDOMToJS).join(', ')}]`
    case 'ternary':
      return `(${jsDOMToJS(rest[0])}) ? (${jsDOMToJS(rest[1])}) : (${jsDOMToJS(rest[2])})`
    case 'if':
      return `if (${jsDOMToJS(rest[0])}) ${jsDOMToJS(rest[1])} else ${jsDOMToJS(rest[2])}`
    case 'block':
      return `{ ${rest.map(jsDOMToJS).join('; ')} }`
    case 'const':
      return `const ${wunsWordToJSId(rest[0])} = ${jsDOMToJS(rest[1])}`
    case 'let':
      return `let ${wunsWordToJSId(rest[0])} = ${jsDOMToJS(rest[1])}`
    case 'assign':
      return `${wunsWordToJSId(rest[0])} = ${jsDOMToJS(rest[1])}`
    case 'return':
      return `return ${jsDOMToJS(rest[0])}`
    case 'loop':
      return `while(1) { ${rest.map(jsDOMToJS).join(';')} }`
    case 'arrow-func': {
      const [params, body] = rest
      return `(${params.map(wunsWordToJSId).join(', ')}) => { ${body.map(jsDOMToJS).join(';')} }`
    }
    case 'arrow-func-rest': {
      const [params, restParam, body] = rest
      const outParams = [...params.map(wunsWordToJSId), `... ${wunsWordToJSId(restParam)}`]
      return `(${outParams.join(', ')}) => { ${body.map(jsDOMToJS).join(';')} }`
    }
    case 'import': {
      const [file, ...imports] = rest
      return `const { ${imports.map(wunsWordToJSId).join(', ')} } = require('./${wordString(file)}')`
    }
    case 'export': {
      return `module.exports = { ${rest.map(wunsWordToJSId).join(', ')} }`
    }
  }
  throw new Error('unexpected: ' + s)
}

const boolToWord = (b) => b | 0
const size = (a) => {
  if (isWord(a)) return wordString(a).length
  if (Array.isArray(a)) return a.length
  throw new Error('getLength expects word or list')
}
const assert = (cond, msg) => {
  if (!cond) throw new Error('built in failed: ' + msg)
}
const at = (v, i) => v.at(i)
const slice = (v, i, j) => v.slice(number(i), number(j))
const push = (ar, e) => {
  if (!Array.isArray(ar)) throw new Error('push expects array')
  if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
  ar.push(e)
  return unit
}
const mutable_list = () => []
const freeze = (ar) => {
  if (!Array.isArray(ar)) throw new Error('freeze expects array')
  if (Object.isFrozen(ar)) throw new Error('freeze expects mutable array')
  return makeList(...ar)
}
const mkFuncEnv = ({ log, ...imports }, instructions) => {
  const funcEnv = new Map()
  for (const [name, func] of Object.entries(imports)) funcEnv.set(name, func)

  for (const [name, func] of Object.entries(instructions)) {
    const parameterCount = func.length
    switch (parameterCount) {
      case 1:
        funcEnv.set(name, (a) => func(number(a)) | 0)
        break
      case 2:
        funcEnv.set(name, (a, b) => func(number(a), number(b)) | 0)
        break
      default:
        throw new Error('unsupported parameter count: ' + parameterCount)
    }
  }

  // would be cool to do in a host-func special form
  funcEnv.set('is-word', (f) => boolToWord(isWord(f)))
  funcEnv.set('is-list', (f) => boolToWord(Array.isArray(f)))
  funcEnv.set('meta', (f) => meta(f))
  funcEnv.set('with-meta', (form, metaData) => {
    if (isWord(form)) return wordWithMeta(wordString(form), metaData)
    if (Array.isArray(form)) return listWithMeta(form, metaData)
    throw new Error('with-meta expects word or list')
  })

  // todo maybe only allow for lists
  funcEnv.set('size', size)
  funcEnv.set('at', (v, i) => {
    const ni = number(i)
    const len = size(v)
    assert(ni >= -len && ni < len, 'index out of bounds: ' + i + ' ' + len)
    if (isWord(v)) return wordString(v).at(ni).charCodeAt(0)
    const elem = v.at(ni)
    if (typeof elem === 'number') return elem
    return elem
  })
  funcEnv.set('slice', (v, i, j) => {
    assert(Array.isArray(v), 'slice expects array')
    let s = v.slice(number(i), number(j))
    if (s instanceof Uint8Array) return makeList(...Array.from(s, (n) => n))
    return Object.freeze(s)
  })

  funcEnv.set('mutable-list', mutable_list)
  funcEnv.set('push', push)
  funcEnv.set('set-array', (ar, index, e) => {
    if (!Array.isArray(ar)) throw new Error('set-array expects array')
    if (Object.isFrozen(ar)) throw new Error('set-array expects mutable array')
    ar[number(index)] = e
    return unit
  })
  funcEnv.set('freeze', freeze)

  // genword??? or should we just implement it in wuns?
  let gensym = 0
  funcEnv.set('gensym', () => word('v' + String(gensym++)))

  funcEnv.set('log', (a) => {
    log(print(a))
    return unit
  })

  funcEnv.set('abort', () => {
    throw new Error("wuns 'abort'")
  })

  funcEnv.set('word-from-codepoint', (cs) => {
    assert(Array.isArray(cs), 'word-from-codepoints expects array')
    return word(String.fromCharCode(number(c)))
  })

  // funcEnv.set('word-from-codepoints', (cs) => {
  //   assert(Array.isArray(cs), 'word-from-codepoints expects array')
  //   return word(cs.map((c) => String.fromCharCode(number(c))).join(''))
  // })

  funcEnv.set('concat-words', (cs) => {
    assert(Array.isArray(cs), 'concat-words expects array')
    for (const c of cs) assert(isWord(c), 'concat-words expects array of words')
    return word(cs.join(''))
  })

  funcEnv.set('wasm-module', (s) => new WebAssembly.Module(new Uint8Array(s.map(number))))

  funcEnv.set('wasm-instance', (module) => new WebAssembly.Instance(module))

  return funcEnv
}

module.exports = {
  mkFuncEnv,
  word,
  isWord,
  is_word: (f) => isWord(f) | 0,
  is_list: (f) => isList(f) | 0,
  makeList,
  wordString,
  number,
  listWithMeta,
  wordWithMeta,
  meta,
  size,
  at,
  slice,
  push,
  mutable_list,
  freeze,
}
