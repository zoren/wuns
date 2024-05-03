const unit = Object.freeze([])
const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))

const symbolContinue = Symbol.for('wuns-continue')
const tryMap = (arr, f) => {
  if (arr) return arr.map(f)
  return unit
}
const makeEvaluator = (funcEnv) => {
  const globalVarValues = new Map()
  const globalEnv = { varValues: globalVarValues, outer: null }
  const apply = ({ params, restParam, bodies }, args) => {
    const varValues = new Map()
    for (let i = 0; i < params.length; i++) varValues.set(params[i], args[i])
    if (restParam) varValues.set(restParam, makeList(...args.slice(params.length)))
    const inner = { varValues, outer: globalEnv }
    let result = unit
    for (const body of bodies) result = wunsEval(body, inner)
    return result
  }
  const assert = (cond, msg) => {
    if (!cond) throw new Error('eval assert failed: ' + msg)
  }
  const wunsEval = (form, env) => {
    if (typeof form === 'string')
      while (true) {
        assert(env, 'undefined word: ' + form)
        const { varValues, outer } = env
        if (varValues.has(form)) return varValues.get(form)
        env = outer
      }

    assert(Array.isArray(form), `cannot eval ${form} expected string or array`)
    if (form.length === 0) return unit
    const [firstWord, ...args] = form
    switch (firstWord) {
      case 'quote':
        return args[0]
      case 'if':
        return wunsEval(args[wunsEval(args[0], env) === '0' ? 2 : 1], env)
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const varValues = new Map()
        const inner = { varValues, outer: env }
        for (let i = 0; i < bindings.length - 1; i += 2) varValues.set(bindings[i], wunsEval(bindings[i + 1], inner))
        let result = unit
        if (firstWord === 'let') {
          for (const body of bodies) result = wunsEval(body, inner)
          return result
        }
        while (true) {
          for (const body of bodies) result = wunsEval(body, inner)
          if (!result[symbolContinue]) return result
          for (let i = 0; i < Math.min(result.length, varValues.size); i++) varValues.set(bindings[i * 2], result[i])
        }
      }
      case 'cont': {
        const contArgs = args.map((a) => wunsEval(a, env))
        contArgs[symbolContinue] = true
        return Object.freeze(contArgs)
      }
      case 'func':
      case 'macro': {
        const [fname, origParams0, ...bodies] = args
        const origParams = origParams0 || unit
        let params = origParams
        let restParam = null
        if (origParams.at(-2) === '..') {
          params = origParams.slice(0, -2)
          restParam = origParams.at(-1)
        }
        const fObj = { isMacro: firstWord === 'macro', params, restParam, bodies }
        funcEnv.set(fname, fObj)
        return unit
      }
      case 'global': {
        const [varName, value] = args
        globalVarValues.set(varName, wunsEval(value, env))
        return unit
      }
    }
    const funcOrMacro = funcEnv.get(firstWord)
    assert(funcOrMacro, `function ${firstWord} not found ${print(form)}`)
    if (typeof funcOrMacro === 'function') return funcOrMacro(...args.map((arg) => wunsEval(arg, env)))
    assert(typeof funcOrMacro === 'object', `expected function or object ${funcOrMacro}`)
    const { isMacro } = funcOrMacro
    if (isMacro) return wunsEval(apply(funcOrMacro, args), env)
    return apply(
      funcOrMacro,
      args.map((arg) => wunsEval(arg, env)),
    )
  }
  const gogomacro = (form) => {
    if (typeof form === 'string') return form
    assert(Array.isArray(form), `cannot expand ${form} expected string or array`)
    if (form.length === 0) return unit
    const [firstWord, ...args] = form
    switch (firstWord) {
      case 'quote':
        return form
      case 'if':
        return makeList(firstWord, ...tryMap(args, gogomacro))
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        return makeList(
          firstWord,
          tryMap(bindings, (borf, i) => (i % 2 === 0 ? borf : gogomacro(borf))),
          ...bodies.map(gogomacro),
        )
      }
      case 'cont':
        return makeList(firstWord, ...args.map(gogomacro))
      case 'func':
      case 'macro': {
        const [fname, origParams, ...bodies] = args
        return makeList(firstWord, fname, origParams, ...bodies.map(gogomacro))
      }
      case 'global': {
        const [varName, value] = args
        return makeList(firstWord, varName, gogomacro(value))
      }
    }
    const funcOrMacro = funcEnv.get(firstWord)
    if (funcOrMacro && funcOrMacro.isMacro) return gogomacro(apply(funcOrMacro, args.map(gogomacro)))
    return makeList(firstWord, ...args.map(gogomacro))
  }
  return {
    gogoeval: (form) => wunsEval(gogomacro(form), globalEnv),
    apply,
  }
}

const print = (x) => {
  if (typeof x === 'string') return x
  if (!Array.isArray(x)) throw new Error(`cannot print ${x}`)
  return `[${x.map(print).join(' ')}]`
}

const number = (s) => {
  const n = Number(s)
  if (isNaN(n)) throw new Error('expected number, found: ' + s)
  if (n !== (n | 0)) throw new Error('expected 32-bit signed integer, found: ' + s)
  return n
}

const mkFuncEnv = ({ log }, instructions) => {
  const funcEnv = new Map()
  const assert = (cond, msg) => {
    if (!cond) throw new Error('built in failed: ' + msg)
  }
  for (const [name, func] of Object.entries(instructions)) {
    const parameterCount = func.length
    funcEnv.set(name, (...args) => {
      assert(args.length === parameterCount, `expected ${parameterCount} arguments, got ${args.length}`)
      return String(func(...args.map(number)) | 0)
    })
  }
  // would be cool to do in a host-func special form
  funcEnv.set('is-word', (s) => boolToWord(typeof s === 'string'))
  funcEnv.set('is-list', (f) => boolToWord(Array.isArray(f)))

  funcEnv.set('size', (a) => String(Number(a.length)))
  funcEnv.set('at', (v, i) => {
    const ni = number(i)
    assert(ni >= -v.length && ni < v.length, 'index out of bounds: ' + i)
    if (typeof v === 'string') return String(v.at(ni).charCodeAt(0))
    const elem = v.at(ni)
    if (typeof elem === 'number') return String(elem)
    return elem
  })
  funcEnv.set('slice', (v, i, j) => {
    let s = v.slice(number(i), number(j))
    if (s instanceof Uint8Array) return Object.freeze(Array.from(s, (n) => String(n)))
    return Object.freeze(s)
  })
  // would be nice to do without these two, as we would prefer no builtin var args
  funcEnv.set('concat', (...args) => Object.freeze(args.flat()))
  funcEnv.set('concat-words', (...ws) => ws.join(''))

  funcEnv.set('mutable-list', () => [])
  funcEnv.set('push', (ar, e) => {
    if (!Array.isArray(ar)) throw new Error('push expects array')
    if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
    ar.push(e)
    return unit
  })

  funcEnv.set('freeze', (ar) => Object.freeze(ar))
  const inDecIntRegex = /^[0-9]+$/
  const isDecIntWord = (s) => inDecIntRegex.test(s)
  funcEnv.set('word', (cs) => {
    assert(Array.isArray(cs), 'word expects array: ' + cs)
    // assert(cs.length > 0, 'word expects non-empty array')
    return cs
      .map((c) => {
        if (typeof c !== 'string') throw new Error('word expects words')
        assert(isDecIntWord(c), 'word expects word chars: ' + c)
        const s = String.fromCharCode(number(c))
        // assert(isWordChar(s), 'word expects word chars: '+s)
        return s
      })
      .join('')
  })
  let gensym = 0
  funcEnv.set('gensym', () => String(gensym++))
  funcEnv.set('log', (a) => {
    log(print(a))
    return unit
  })

  funcEnv.set('abort', () => {
    throw new Error("wuns 'abort'")
  })

  return funcEnv
}

const evalForms = (forms, { importObject, instructions }) => {
  const funcEnv = mkFuncEnv(importObject, instructions)
  const { gogoeval } = makeEvaluator(funcEnv)
  for (const form of forms) gogoeval(form)
}

module.exports = { evalForms }
