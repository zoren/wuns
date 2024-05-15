const { makeList, word, wordString, isWord, isList, numberWord, isUnit, unit, print, wordWithMeta, listWithMeta } = require('./core.js')
const { mkFuncEnv } = require('./std.js')

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
        assert(env, 'undefined variable: ' + s)
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
      case 'tuple':
        return makeList(...args.map((a) => wunsEval(a, env)))
      case 'extern': {
        if (args.length !== 3) throw new Error('extern expects 2 arguments')
        const [name, params, results] = args
        // funcEnv.set(wordString(name), func)
        const funcObj = funcEnv.get(wordString(name))
        assert(funcObj, `extern function ${name} not found`)
        if (!(typeof funcObj === 'function')) throw new Error(`expected function, found ${funcObj}`)
        const parameterCount = funcObj.length
        assert(isList(params), `extern expected list of parameters, found ${params}`)
        assert(
          params.length === parameterCount,
          `extern function ${name} expected ${parameterCount} arguments, got ${params.length}`,
        )
        for (const param of params) {
          if (!isWord(param)) throw new Error('extern expected word arguments')
        }
        return unit
      }
    }
    try {
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
    } catch (e) {
      console.error('error evaluating', firstWordString)
      throw e
    }
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
  const gogoeval = (form) => wunsEval(gogomacro(form), globalEnv)

  funcEnv.set('macroexpand', gogomacro)
  funcEnv.set('eval', gogoeval)

  return {
    gogoeval,
    apply,
    getExport: (name) => funcEnv.get(name),
  }
}

const nodeToOurForm = (node) => {
  const { type, text, namedChildren, startPosition, endPosition } = node
  const range = makeList(
    ...[startPosition.row, startPosition.column, endPosition.row, endPosition.column].map(numberWord),
  )
  const metaData = makeList(word('range'), range, word('node-id'), numberWord(node.id))
  switch (type) {
    case 'word':
      return wordWithMeta(text, metaData)
    case 'list':
      return listWithMeta(namedChildren.map(nodeToOurForm), metaData)
    default:
      throw new Error('unexpected node type: ' + type)
  }
}

const evalTree = (tree, { importObject, instructions }) => {
  const funcEnv = mkFuncEnv(importObject, instructions)
  const evaluator = makeEvaluator(funcEnv)
  const { gogoeval } = evaluator
  for (const node of tree.rootNode.children) {
    const form = nodeToOurForm(node)
    try {
      gogoeval(form)
    } catch (e) {
      console.error('error evaluating', print(form), e)
      throw e
    }
  }
  return evaluator
}

module.exports = { treeToOurForm: nodeToOurForm, evalTree, makeEvaluator }
