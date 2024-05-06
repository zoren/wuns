const unit = Object.freeze([])
const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))
const isUnit = (x) => x === unit || (Array.isArray(x) && Object.isFrozen(x) && x.length === 0)

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
    for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
    if (restParam) varValues.set(restParam, makeList(...args.slice(arity)))
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
        return args.length === 1 ? args[0] : args
      case 'if': {
        const ifArgs = [...args, unit, unit, unit].slice(0, 3)
        return wunsEval(ifArgs[wunsEval(ifArgs[0], env) === '0' ? 2 : 1], env)
      }
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const varValues = new Map()
        const inner = { varValues, outer: env }
        for (let i = 0; i < bindings.length - 1; i += 2) {
          const varName = bindings[i]
          const value = wunsEval(bindings[i + 1], inner)
          if (varName === '-') {
            if (!isUnit(value))
              console.log(`warning: discarding non-unit value ${value} for varName ${varName} in ${print(form)}`)
            continue
          }
          varValues.set(varName, value)
        }
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
        const [fmname, origParams0, ...bodies] = args
        const origParams = origParams0 || unit
        let params = origParams
        let restParam = null
        if (origParams.at(-2) === '..') {
          params = origParams.slice(0, -2)
          restParam = origParams.at(-1)
        }
        const fObj = { name: fmname, isMacro: firstWord === 'macro', params, restParam, bodies }
        funcEnv.set(fmname, fObj)
        return unit
      }
      case 'constant': {
        const [varName, value] = args
        globalVarValues.set(varName, wunsEval(value, env))
        return unit
      }
      case 'wasm-import-func': {
        if (args.length !== 3) throw new Error('wasm-import expects 3 arguments')
        const [instanceArg, exportFunctionName, importName] = args
        const instance = wunsEval(instanceArg, env)
        assert(instance instanceof WebAssembly.Instance, `expected wasm instance, found ${instance}`)
        const f = instance.exports[exportFunctionName]
        if (typeof f !== 'function') throw new Error(`expected function, found ${f}`)
        const fObj = { wasmFunc: true, f }
        funcEnv.set(importName, fObj)
        return unit
      }
    }
    const funcOrMacro = funcEnv.get(firstWord)
    assert(funcOrMacro, `function ${firstWord} not found ${print(form)}`)
    if (typeof funcOrMacro === 'function') {
      const parameterCount = funcOrMacro.length
      assert(args.length === parameterCount, `${firstWord} expected ${parameterCount} arguments, got ${args.length}`)
      const res = funcOrMacro(...args.map((arg) => wunsEval(arg, env)))
      if (typeof res === 'number') return String(res)
      if (res === undefined) return unit
      return res
    }
    assert(typeof funcOrMacro === 'object', `expected function or object ${funcOrMacro}`)
    const { isMacro, wasmFunc } = funcOrMacro
    if (wasmFunc) {
      const res = funcOrMacro.f(...args.map((arg) => wunsEval(arg, env)))
      if (typeof res === 'undefined') return unit
      if (typeof res === 'number') return String(res)
      assert(Array.isArray(res), `expected array or undefined, found ${res}`)
      return makeList(
        ...res.map((r) => {
          assert(typeof r === 'number', `expected number, found ${r}`)
          return String(r)
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
      case 'constant': {
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
        funcEnv.set(name, (a) => String(func(number(a)) | 0))
        break
      case 2:
        funcEnv.set(name, (a, b) => String(func(number(a), number(b)) | 0))
        break
      default:
        throw new Error('unsupported parameter count: ' + parameterCount)
    }
  }
  const boolToWord = (b) => (b ? '1' : '0')
  // would be cool to do in a host-func special form
  funcEnv.set('is-word', (f) => boolToWord(typeof f === 'string'))
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

  funcEnv.set('mutable-list', () => [])
  funcEnv.set('push', (ar, e) => {
    if (!Array.isArray(ar)) throw new Error('push expects array')
    if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
    ar.push(e)
    return unit
  })
  funcEnv.set('set-array', (ar, index, e) => {
    if (!Array.isArray(ar)) throw new Error('push expects array')
    if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
    ar[number(index)] = e
    return unit
  })
  funcEnv.set('freeze', (ar) => makeList(...ar))

  let gensym = 0
  funcEnv.set('gensym', () => 'v' + String(gensym++))
  funcEnv.set('log', (a) => {
    log(print(a))
    return unit
  })

  funcEnv.set('abort', () => {
    throw new Error("wuns 'abort'")
  })

  funcEnv.set('word-from-codepoints', (cs) => {
    assert(Array.isArray(cs), 'word-from-codepoints expects array')
    return cs.map((c) => String.fromCharCode(number(c))).join('')
  })

  funcEnv.set('wasm-module', (s) => new WebAssembly.Module(new Uint8Array(s.map(number))))

  funcEnv.set('wasm-instance', (module) => new WebAssembly.Instance(module))

  return funcEnv
}

const evalForms = (forms, { importObject, instructions }) => {
  const funcEnv = mkFuncEnv(importObject, instructions)
  const { gogoeval } = makeEvaluator(funcEnv)
  for (const form of forms) gogoeval(form)
}

module.exports = { evalForms }
