import { setJSFunctionName, parseFunctionParameters, createParameterNamesWrapper } from './utils.js'
import { isWord, isList, print, meta, makeList, isForm, defVar, defVarWithMeta } from './core.js'
import { instructionFunctions } from './instructions.js'
import { parseFile } from './parseTreeSitter.js'
import { isJSReservedWord } from './utils.js'

class RuntimeError extends Error {
  constructor(message, form, innerError) {
    super(message)
    this.form = form
    this.innerError = innerError
  }
}

class CompileError extends Error {
  constructor(message, form, innerError) {
    super(message)
    this.form = form
    this.innerError = innerError
  }
}

const hasCtxVar = (ctx, v) => {
  while (ctx) {
    if (ctx.varDescs.has(v)) return true
    ctx = ctx.outer
  }
  return false
}

const ctWordValue = (w) => {
  if (!isWord(w)) throw new CompileError('not a word: ' + w + ' ' + typeof w, w)
  return w.value
}

const tryGetWordValue = (w) => {
  if (!isWord(w)) return null
  return w.value
}

const parseParams = (params) => {
  if (params.length > 1 && tryGetWordValue(params.at(-2)) === '..') {
    const restParam = params.at(-1)
    params = params.slice(0, -2)
    return { params, restParam }
  }
  return { params, restParam: null }
}

const createNamedFunction = (name, jsParameterNames, wunsParameterNames, wunsRestParameter, body) => {
  const f = createParameterNamesWrapper(jsParameterNames)(body)
  setJSFunctionName(f, name)
  f.parameters = wunsParameterNames
  if (wunsRestParameter) f.restParam = wunsRestParameter
  return Object.freeze(f)
}

const paramStringToJS = (p) => (isJSReservedWord(p) ? '_' : '') + p.replace(/-/g, '_')

const checkCallArity = (errorFn) => (func, form) => {
  const nOfParams = func.parameters.length
  const numOfGivenArgs = form.length - 1
  if (func.restParam) {
    if (numOfGivenArgs < nOfParams)
      throw new errorFn(`${func.name} expected at least ${nOfParams} arguments, got ${numOfGivenArgs}`, form)
  } else {
    if (numOfGivenArgs !== nOfParams)
      throw new errorFn(`${func.name} expected ${nOfParams} arguments, got ${numOfGivenArgs}`, form)
  }
}

const ctCheckCallArity = checkCallArity(CompileError)
const rtCheckCallArity = checkCallArity(RuntimeError)

const makeInterpreterContext = (externalModules) => {
  const defVars = new Map()
  const insertDefVar = (defVarObject) => {
    const varName = defVarObject.name
    if (defVars.has(varName)) throw new RuntimeError(`redefining var: ${varName}`)
    defVars.set(varName, defVarObject)
  }
  const compBodies = (ctx, bodies) => {
    const cbodies = bodies.map((body) => compile(ctx, body))
    return (env) => {
      let result = undefined
      for (const cbody of cbodies) result = cbody(env)
      return result
    }
  }
  const compile = (ctx, form) => {
    {
      const varName = tryGetWordValue(form)
      if (varName) {
        if (hasCtxVar(ctx, varName))
          return (env) => {
            while (env) {
              const { varValues, outer } = env
              if (varValues.has(varName)) return varValues.get(varName)
              env = outer
            }
            throw new RuntimeError(`variable ${varName} not found`, form)
          }
        const defVar = defVars.get(varName)
        if (!defVar) throw new CompileError('not found: ' + varName, form)
        return () => defVar.value
      }
    }
    // do not allow non-forms
    if (!isList(form)) throw new CompileError('not a form', form)
    if (form.length === 0) return () => undefined
    const [firstForm, ...args] = form
    const firstWordValue = tryGetWordValue(firstForm)
    switch (firstWordValue) {
      case 'i32': {
        if (args.length !== 1) throw new CompileError('i32 expects 1 argument', form)
        const wv = +ctWordValue(args[0])
        const normalized = wv | 0
        if (wv !== normalized) throw new CompileError('expected 32-bit signed integer', form)
        return () => normalized
      }
      case 'quote': {
        const res = args.length === 1 ? args[0] : makeList(...args)
        if (!isForm(res)) throw new CompileError('quote expects form', form)
        return () => res
      }
      case 'if': {
        if (args.length < 2 || 3 < args.length) throw new CompileError('if expects 2 or 3 arguments', form)
        const cc = compile(ctx, args[0])
        const ct = compile(ctx, args[1])
        if (args.length === 2) return (env) => (cc(env) === 0 ? undefined : ct(env))
        const cf = compile(ctx, args[2])
        // consider being more strict only allowing numbers in the condition, for now we use truthy/falsy for try-get-* functions
        return (env) => (cc(env) === 0 ? cf : ct)(env)
      }
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const compBindings = []
        const varDescs = new Map()
        const newCtx = { varDescs, outer: ctx, ctxType: firstWordValue }
        const varDesc = { defForm: firstWordValue }
        for (let i = 0; i < bindings.length - 1; i += 2) {
          const v = ctWordValue(bindings[i])
          compBindings.push([v, compile(newCtx, bindings[i + 1])])
          varDescs.set(v, varDesc)
        }
        const mkBindEnv = (env) => {
          const varValues = new Map()
          const inner = { varValues, outer: env }
          for (const [varName, compVal] of compBindings) varValues.set(varName, compVal(inner))
          return inner
        }
        const cbodies = compBodies(newCtx, bodies)
        if (firstWordValue === 'let') return (env) => cbodies(mkBindEnv(env))
        return (env) => {
          const inner = mkBindEnv(env)
          inner.continue = true
          while (inner.continue) {
            inner.continue = false
            const result = cbodies(inner)
            if (!inner.continue) return result
          }
        }
      }
      case 'continue': {
        const updateVars = []
        const updateFuncs = []
        for (let i = 0; i < args.length; i += 2) {
          updateVars.push(ctWordValue(args[i]))
          updateFuncs.push(compile(ctx, args[i + 1]))
        }
        let enclosingLoopCtx = ctx
        while (true) {
          if (!enclosingLoopCtx) throw new CompileError('continue outside of loop', form)
          if (enclosingLoopCtx.ctxType === 'loop') break
          enclosingLoopCtx = enclosingLoopCtx.outer
        }
        for (const uv of updateVars) {
          if (!enclosingLoopCtx.varDescs.has(uv))
            throw new CompileError(`loop variable ${uv} not found in loop context`, form)
        }
        return (env) => {
          let enclosingLoopEnv = env
          while (true) {
            if ('continue' in enclosingLoopEnv) break
            enclosingLoopEnv = enclosingLoopEnv.outer
          }
          const { varValues } = enclosingLoopEnv
          // it's important to evaluate all the update functions before updating the variables as they might depend on each other
          const tmpVals = updateFuncs.map((f) => f(env))
          for (let i = 0; i < updateVars.length; i++) varValues.set(updateVars[i], tmpVals[i])
          enclosingLoopEnv.continue = true
        }
      }
      case 'func': {
        const [fmname, origParams, ...bodies] = args
        const strFuncName = ctWordValue(fmname)
        const parsedParams = parseParams(origParams)
        const params = parsedParams.params.map(ctWordValue)
        const restParam = parsedParams.restParam ? ctWordValue(parsedParams.restParam) : null
        const varDescs = new Map()
        const paramDesc = { defForm: firstWordValue }
        for (const p of params) varDescs.set(p, paramDesc)
        if (restParam) varDescs.set(restParam, paramDesc)
        const nOfParams = params.length
        const newCtx = {
          varDescs,
          outer: null,
          ctxType: firstWordValue,
          parameters: params,
          restParam,
        }
        const cbodies = compBodies(newCtx, bodies)
        const body = restParam
          ? (...args) => {
              const varValues = new Map()
              for (let i = 0; i < nOfParams; i++) varValues.set(params[i], args[i])
              varValues.set(restParam, makeList(...args.slice(nOfParams)))
              return cbodies({ varValues })
            }
          : (...args) => {
              const varValues = new Map()
              for (let i = 0; i < nOfParams; i++) varValues.set(params[i], args[i])
              return cbodies({ varValues })
            }
        const jsParameterNames = params.map(paramStringToJS)
        if (restParam) jsParameterNames.push(paramStringToJS('...' + restParam))
        const f = createNamedFunction(strFuncName, jsParameterNames, params, restParam, body)
        // for recursive calls
        newCtx.func = f
        Object.freeze(newCtx)
        return () => f
      }
      case 'recur': {
        let curCtx = ctx
        while (curCtx.outer) curCtx = curCtx.outer
        ctCheckCallArity(curCtx, form)
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => curCtx.func(...cargs.map((carg) => carg(env)))
      }
      case 'extern': {
        const names = args.map(ctWordValue)
        let ext = externalModules
        for (const n of names) {
          if (!(n in ext)) throw new CompileError(`module ${names.join(' ')} not found`, form)
          ext = ext[n]
        }
        return () => ext
      }
      case 'try-get-var': {
        if (args.length !== 1) throw new CompileError('try-get-var expects 1 argument', form)
        const varName = ctWordValue(args[0])
        return () => {
          const v = defVars.get(varName)
          if (v) return v
          return 0
        }
      }
      case 'def': {
        if (args.length !== 2) throw new CompileError('def expects 2 arguments', form)
        const [varName, value] = args
        const v = ctWordValue(varName)
        const cvalue = compile(ctx, value)
        return (env) => insertDefVar(defVar(v, cvalue(env)))
      }
      case 'def-with-meta': {
        if (args.length !== 3) throw new CompileError('def expects 3 arguments', form)
        const [varName, metaForm, value] = args
        const v = ctWordValue(varName)
        const cmetaData = compile(ctx, metaForm)
        const cvalue = compile(ctx, value)
        return (env) => insertDefVar(defVarWithMeta(v, cmetaData(env), cvalue(env)))
      }
    }
    // direct function call or function in parameter/local variable
    if (!firstWordValue || hasCtxVar(ctx, firstWordValue)) {
      const cfunc = compile(ctx, firstForm)
      const cargs = args.map((a) => compile(ctx, a))
      return (env) => {
        const f = cfunc(env)
        if (typeof f !== 'function') throw new RuntimeError(`expected function, got ${f}`)
        rtCheckCallArity(f, form)
        return f(...cargs.map((carg) => carg(env)))
      }
    }
    const funcDefVar = defVars.get(firstWordValue)
    if (!funcDefVar) throw new CompileError(`function '${firstWordValue}' not found`, form)
    const func = funcDefVar.value
    if (typeof func !== 'function') throw new CompileError(`expected function, got ${func}`, form)
    ctCheckCallArity(func, form)
    const varMeta = meta(funcDefVar)
    const noEvalArgs = varMeta['no-eval-args']
    const evalResult = varMeta['eval-result']
    // function, eval args and don't eval result
    if (!noEvalArgs && !evalResult) {
      const cargs = args.map((a) => compile(ctx, a))
      return (env) => {
        const eargs = cargs.map((carg) => carg(env))
        try {
          return func(...eargs)
        } catch (e) {
          throw new RuntimeError(`runtime error when calling function '${firstWordValue}'`, form, e)
        }
      }
    }
    // macro, don't eval args and eval result
    if (noEvalArgs && evalResult) {
      let macroResult
      try {
        macroResult = func(...args)
      } catch (e) {
        if (e instanceof RuntimeError)
          throw new CompileError(`runtime error when calling macro '${firstWordValue}': ${e.message}`, form, e)
        throw e
      }
      if (!isForm(macroResult)) throw new CompileError('macro must return form', form)
      return compile(ctx, macroResult)
    }
    // fexpr, don' eval args and don't eval result
    // thanks Manuel! https://x.com/msimoni/status/1824128031792787808
    if (noEvalArgs && !evalResult) {
      const fexprResult = func(...args)
      return () => fexprResult
    }
    // manc, eval args and eval result
    if (!noEvalArgs && evalResult) {
      const cargs = args.map((a) => compile(ctx, a))
      return (env) => {
        const mancResult = func(...cargs.map((carg) => carg(env)))
        if (!isForm(mancResult)) throw new CompileError('manc must return form', form)
        try {
          return compile(ctx, mancResult)
        } catch (e) {
          if (e instanceof CompileError)
            throw new RuntimeError(`compiletime error when calling manc '${firstWordValue}': ${error.message}`, form, e)
          throw e
        }
      }
    }
    throw new CompileError(`unreachable, invalid function/macro/fexpr/manc combination for '${firstWordValue}'`, form)
  }
  const compileTop = (form) => {
    const compRes = compile(null, form)
    const evaluate = () => compRes(null)
    return evaluate
  }
  return compileTop
}

export const getFormLocation = (subForm) => (subForm ? meta(subForm).location : undefined) || 'unknown location'

const underscoreToDash = (s) => s.replace(/_/g, '-')

const wrapJSFunction = (importFunc) => {
  const dashedName = underscoreToDash(importFunc.name)
  const jsParameterNames = parseFunctionParameters(importFunc)
  let wunsParameterNames = null
  let restParam = null
  if (jsParameterNames.length && jsParameterNames.at(-1).startsWith('...')) {
    wunsParameterNames = jsParameterNames.slice(0, -1)
    restParam = underscoreToDash(jsParameterNames.at(-1).slice(3))
  } else {
    wunsParameterNames = [...jsParameterNames]
  }
  wunsParameterNames = wunsParameterNames.map(underscoreToDash)
  const namedFunc = createNamedFunction(
    dashedName,
    jsParameterNames,
    wunsParameterNames,
    restParam,
    (...args) => {
      const res = importFunc(...args)
      if (typeof res === 'boolean') return res | 0
      return res
    },
  )
  return namedFunc
}

const make_eval_context = (external_modules) => {
  const compile = makeInterpreterContext(external_modules)
  const evaluate = (form) => compile(form)()
  const wrappedEvaluate = wrapJSFunction(evaluate)
  // todo maybe return context instead of a function as it will be difficult to pass as a parameter in wasm
  return wrappedEvaluate
}

const wrapJSFunctionsToObject = (funcs) => {
  const newObject = {}
  for (const importFunc of funcs) {
    const func = wrapJSFunction(importFunc)
    newObject[func.name] = func
  }
  return Object.freeze(newObject)
}

const externalModules = Object.freeze({
  instructions: wrapJSFunctionsToObject(instructionFunctions),
  host: wrapJSFunctionsToObject(Object.values(await import('./host.js'))),
  interpreter: wrapJSFunctionsToObject([make_eval_context]),
})

export const makeInitContext = () => {
  const compile = makeInterpreterContext(externalModules)
  Object.freeze(externalModules)
  return { compile }
}

export const runCform = (exp) => {
  try {
    return exp()
  } catch (e) {
    if (e instanceof RuntimeError) {
      console.error(`runtime error in ${getFormLocation(e.form)}: ${e.message}`)
    } else if (e instanceof CompileError) {
      console.error(`compiletime error in ${getFormLocation(e.form)}: ${e.message}`)
    } else throw e
  }
}

const compEvalLog = (compile, form) => {
  const cform = (() => {
    try {
      return compile(form)
    } catch (e) {
      if (e instanceof CompileError) {
        console.error(`compile error in ${getFormLocation(e.form || form)}: ${e.message}`)
        console.error(e)
      } else {
        console.error(`unexpected non-compile error: ${e.message}`)
      }
      throw e
    }
  })()
  try {
    return cform(null)
  } catch (e) {
    if (e instanceof RuntimeError) {
      console.error(`runtime error in ${getFormLocation(e.form || form)}: ${e.message}`)
      // console.error(e)
      let innerError = e.innerError
      while (innerError) {
        console.error(`inner error in ${getFormLocation(innerError.form)}: ${innerError.message}`)
        innerError = innerError.innerError
      }
    } else {
      console.error(`unexpected non-runtime error: ${e.message}`)
    }
    throw e
  }
}

export const evalLogForms = (compile, forms) => {
  for (const form of forms) {
    const v = compEvalLog(compile, form)
    if (v !== undefined) console.log(print(v))
  }
}

export const parseEvalFiles = (compile, filenames) => {
  for (const filename of filenames) {
    for (const form of parseFile(filename)) {
      compEvalLog(compile, form)
    }
  }
}
