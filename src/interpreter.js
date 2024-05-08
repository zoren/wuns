const unit = Object.freeze([])
const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))
const isUnit = (x) => x === unit || (Array.isArray(x) && Object.isFrozen(x) && x.length === 0)

class Word {
  constructor(value) {
    this.value = value
  }

  toString() {
    return this.value
  }
}

const isWord = (f) => f instanceof Word

const word = (s) => {
  if (typeof s !== 'string') throw new Error('word expects string arguments only')
  return Object.freeze(new Word(s))
}

const symbolMeta = Symbol.for('wuns-meta')

const wordWithMeta = (s, meta) => {
  if (typeof s !== 'string') throw new Error('word expects string arguments only')
  const w = new Word(s)
  w[symbolMeta] = meta
  return Object.freeze(w)
}

const listWithMeta = (l, meta) => {
  const ll = [...l]
  ll[symbolMeta] = meta
  return Object.freeze(ll)
}

const meta = (form) => {
  if (form[symbolMeta]) return form[symbolMeta]
  return unit
}

const numberWord = (n) => {
  if (typeof n !== 'number') throw new Error('numberWord expects number')
  return word(String(n))
}

const wordString = (w) => {
  if (!isWord(w)) throw new Error('not a word: ' + w + ' ' + typeof w)
  return w.value
}

const print = (x) => {
  if (isWord(x)) return wordString(x)
  if (!Array.isArray(x)) throw new Error(`cannot print ${x}`)
  return `[${x.map(print).join(' ')}]`
}

const symbolContinue = Symbol.for('wuns-continue')
const tryMap = (arr, f) => {
  if (arr) return arr.map(f)
  return unit
}
const makeEvaluator = (funcEnv) => {
  const globalVarValues = new Map()
  const globalEnv = { varValues: globalVarValues, outer: null }
  const apply = ({ name, params, restParam, bodies }, args) => {
    const arity = params.length
    const numberOfGivenArgs = args.length
    if (restParam === null) {
      if (arity !== numberOfGivenArgs) throw new Error(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`)
    } else {
      if (arity > numberOfGivenArgs)
        throw new Error(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`)
    }
    const varValues = new Map()
    for (let i = 0; i < arity; i++) varValues.set(wordString(params[i]), args[i])
    if (restParam) varValues.set(wordString(restParam), makeList(...args.slice(arity)))
    const inner = { varValues, outer: globalEnv }
    let result = unit
    for (const body of bodies) result = wunsEval(body, inner)
    return result
  }
  const assert = (cond, msg) => {
    if (!cond) throw new Error('eval assert failed: ' + msg)
  }
  const wunsEval = (form, env) => {
    if (isWord(form)) {
      const s = wordString(form)
      while (true) {
        assert(env, 'undefined word: ' + s)
        const { varValues, outer } = env
        if (varValues.has(s)) return varValues.get(s)
        env = outer
      }
    }

    assert(Array.isArray(form), `cannot eval ${form} expected word or list`)
    if (form.length === 0) return unit
    const [firstForm, ...args] = form
    const firstWordString = wordString(firstForm)
    switch (firstWordString) {
      case 'quote':
        return args.length === 1 ? args[0] : args
      case 'if': {
        const ifArgs = [...args, unit, unit, unit].slice(0, 3)
        const evaledCond = wunsEval(ifArgs[0], env)
        const isZeroWord = isWord(evaledCond) && wordString(evaledCond) === '0'
        return wunsEval(ifArgs[isZeroWord ? 2 : 1], env)
      }
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const varValues = new Map()
        const inner = { varValues, outer: env }
        for (let i = 0; i < bindings.length - 1; i += 2) {
          const varName = wordString(bindings[i])
          const value = wunsEval(bindings[i + 1], inner)
          if (varName === '-') {
            if (!isUnit(value))
              console.log(`warning: discarding non-unit value ${value} for varName ${varName} in ${print(form)}`)
            continue
          }
          varValues.set(varName, value)
        }
        let result = unit
        if (firstWordString === 'let') {
          for (const body of bodies) result = wunsEval(body, inner)
          return result
        }
        while (true) {
          for (const body of bodies) result = wunsEval(body, inner)
          if (!result[symbolContinue]) return result
          for (let i = 0; i < Math.min(result.length, varValues.size); i++)
            varValues.set(wordString(bindings[i * 2]), result[i])
        }
      }
      case 'cont': {
        const contArgs = args.map((a) => wunsEval(a, env))
        contArgs[symbolContinue] = true
        return Object.freeze(contArgs)
      }
      case 'func':
      case 'macro': {
        const [fmname, origParams0, ...bodies] = args
        const origParams = origParams0 || unit
        let params = origParams
        let restParam = null
        if (origParams.length > 1 && wordString(origParams.at(-2)) === '..') {
          params = origParams.slice(0, -2)
          restParam = origParams.at(-1)
        }
        const fObj = { name: fmname, isMacro: firstWordString === 'macro', params, restParam, bodies }
        funcEnv.set(wordString(fmname), fObj)
        return unit
      }
      case 'constant': {
        const [varName, value] = args
        globalVarValues.set(wordString(varName), wunsEval(value, env))
        return unit
      }
      case 'wasm-import-func': {
        if (args.length !== 3) throw new Error('wasm-import expects 3 arguments')
        const [instanceArg, exportFunctionName, importName] = args
        const instance = wunsEval(instanceArg, env)
        assert(instance instanceof WebAssembly.Instance, `expected wasm instance, found ${instance}`)
        const f = instance.exports[wordString(exportFunctionName)]
        if (typeof f !== 'function') throw new Error(`expected function, found ${f}`)
        const fObj = { wasmFunc: true, f }
        funcEnv.set(wordString(importName), fObj)
        return unit
      }
    }
    const funcOrMacro = funcEnv.get(firstWordString)
    assert(funcOrMacro, `function ${firstWordString} not found ${print(form)}`)
    if (typeof funcOrMacro === 'function') {
      const parameterCount = funcOrMacro.length
      assert(
        args.length === parameterCount,
        `${firstWordString} expected ${parameterCount} arguments, got ${args.length}`,
      )
      const res = funcOrMacro(...args.map((arg) => wunsEval(arg, env)))
      if (typeof res === 'number') return numberWord(res)
      if (res === undefined) return unit
      return res
    }
    assert(typeof funcOrMacro === 'object', `expected function or object ${funcOrMacro}`)
    const { isMacro, wasmFunc } = funcOrMacro
    if (wasmFunc) {
      const res = funcOrMacro.f(...args.map((arg) => wunsEval(arg, env)))
      if (typeof res === 'undefined') return unit
      if (typeof res === 'number') return numberWord(res)
      assert(Array.isArray(res), `expected array or undefined, found ${res}`)
      return makeList(
        ...res.map((r) => {
          assert(typeof r === 'number', `expected number, found ${r}`)
          return numberWord(r)
        }),
      )
    }
    if (isMacro) return wunsEval(apply(funcOrMacro, args), env)
    return apply(
      funcOrMacro,
      args.map((arg) => wunsEval(arg, env)),
    )
  }
  const gogomacro = (form) => {
    if (isWord(form)) return form
    assert(Array.isArray(form), `cannot expand ${form} expected word or list`)
    if (form.length === 0) return unit
    const [firstForm, ...args] = form
    const firstWordString = wordString(firstForm)
    switch (firstWordString) {
      case 'quote':
        return form
      case 'if':
        return makeList(firstForm, ...tryMap(args, gogomacro))
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        return makeList(
          firstForm,
          tryMap(bindings, (borf, i) => (i % 2 === 0 ? borf : gogomacro(borf))),
          ...bodies.map(gogomacro),
        )
      }
      case 'cont':
        return makeList(firstForm, ...args.map(gogomacro))
      case 'func':
      case 'macro': {
        const [fname, origParams, ...bodies] = args
        return makeList(firstForm, fname, origParams, ...bodies.map(gogomacro))
      }
      case 'constant': {
        const [varName, value] = args
        return makeList(firstForm, varName, gogomacro(value))
      }
    }
    const funcOrMacro = funcEnv.get(firstWordString)
    if (funcOrMacro && funcOrMacro.isMacro) return gogomacro(apply(funcOrMacro, args.map(gogomacro)))
    return makeList(firstForm, ...args.map(gogomacro))
  }
  return {
    gogoeval: (form) => wunsEval(gogomacro(form), globalEnv),
    apply,
  }
}

const number = (f) => {
  if (!isWord(f)) throw new Error('expected word: ' + f)
  const s = wordString(f)
  const n = Number(s)
  if (isNaN(n)) throw new Error('expected number, found: ' + s)
  const normalised = n | 0
  if (n !== normalised) throw new Error('expected 32-bit signed integer, found: ' + s)
  // if (String(normalised) !== s) throw new Error('expected normalized integer, found: ' + s)
  return n
}

const mkFuncEnv = ({ log }, instructions) => {
  const funcEnv = new Map()
  const assert = (cond, msg) => {
    if (!cond) throw new Error('built in failed: ' + msg)
  }
  for (const [name, func] of Object.entries(instructions)) {
    const parameterCount = func.length
    switch (parameterCount) {
      case 1:
        funcEnv.set(name, (a) => numberWord(func(number(a)) | 0))
        break
      case 2:
        funcEnv.set(name, (a, b) => numberWord(func(number(a), number(b)) | 0))
        break
      default:
        throw new Error('unsupported parameter count: ' + parameterCount)
    }
  }
  const zero = numberWord(0)
  const one = numberWord(1)
  const boolToWord = (b) => (b ? one : zero)
  // would be cool to do in a host-func special form
  funcEnv.set('is-word', (f) => boolToWord(isWord(f)))
  funcEnv.set('is-list', (f) => boolToWord(Array.isArray(f)))
  funcEnv.set('meta', (f) => meta(f))

  const getLength = (a) => {
    if (isWord(a)) return wordString(a).length
    if (Array.isArray(a)) return a.length
    throw new Error('getLength expects word or list')
  }
  // todo maybe only allow for lists
  funcEnv.set('size', (a) => numberWord(getLength(a)))
  funcEnv.set('at', (v, i) => {
    const ni = number(i)
    const len = getLength(v)
    assert(ni >= -len && ni < len, 'index out of bounds: ' + i)
    if (isWord(v)) return numberWord(wordString(v).at(ni).charCodeAt(0))
    const elem = v.at(ni)
    if (typeof elem === 'number') return numberWord(elem)
    return elem
  })
  funcEnv.set('slice', (v, i, j) => {
    assert(Array.isArray(v), 'slice expects array')
    let s = v.slice(number(i), number(j))
    if (s instanceof Uint8Array) return makeList(...Array.from(s, (n) => numberWord(n)))
    return Object.freeze(s)
  })

  funcEnv.set('mutable-list', () => [])
  funcEnv.set('push', (ar, e) => {
    if (!Array.isArray(ar)) throw new Error('push expects array')
    if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
    ar.push(e)
    return unit
  })
  funcEnv.set('set-array', (ar, index, e) => {
    if (!Array.isArray(ar)) throw new Error('set-array expects array')
    if (Object.isFrozen(ar)) throw new Error('set-array expects mutable array')
    ar[number(index)] = e
    return unit
  })
  funcEnv.set('freeze', (ar) => {
    if (!Array.isArray(ar)) throw new Error('freeze expects array')
    if (Object.isFrozen(ar)) throw new Error('freeze expects mutable array')
    return makeList(...ar)
  })

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
    return word(cs.join(''))
  })

  funcEnv.set('wasm-module', (s) => new WebAssembly.Module(new Uint8Array(s.map(number))))

  funcEnv.set('wasm-instance', (module) => new WebAssembly.Instance(module))

  return funcEnv
}

const treeToOurForm = (node) => {
  const { type, text, namedChildren, startPosition, endPosition } = node
  const range = makeList(...[startPosition.row, startPosition.column, endPosition.row, endPosition.column].map(numberWord))
  const metaData = makeList(word('range'), range)
  switch (type) {
    case 'word':
      return wordWithMeta(text, metaData)
    case 'list':
      return listWithMeta(namedChildren.map(treeToOurForm), metaData)
    default:
      throw new Error('unexpected node type: ' + type)
  }
}

const evalTree = (tree, { importObject, instructions }) => {
  const funcEnv = mkFuncEnv(importObject, instructions)
  const { gogoeval } = makeEvaluator(funcEnv)
  for (const node of tree.rootNode.children) {
    const form = treeToOurForm(node)
    try {
      gogoeval(form)
    } catch (e) {
      console.error('error evaluating', print(form), e)
      throw e
    }
  }
  return funcEnv
}

module.exports = { treeToOurForm, evalTree, makeEvaluator, mkFuncEnv }
