import { isWord, isList, print, isSigned32BitInteger, meta, makeList, isForm, defVar, defVarWithMeta } from './core.js'
import { instructions } from './instructions.js'
import { parseFile } from './parseTreeSitter.js'

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

const setJSFunctionName = (f, value) => {
  Object.defineProperty(f, 'name', { value })
}

// creates a wrapping function for a number of parameters and an optional rest parameter
// the resulting function will have the same .length property as in javascript
const createArityFunctionWrapper = (length, hasRestParam) => {
  const params = Array.from({ length }, (_, i) => `p${i}`)
  if (hasRestParam) params.push('...rest')
  const paramsString = params.join(', ')
  return Function('body', `return function (${paramsString}) { return body(${paramsString}) }`)
}

const checkCallArity = (nOfParams, hasRestParam, form) => {
  if (nOfParams === undefined) throw new CompileError(`expected function/macro/fexpr/manc, got variable ${form}`, form)
  const numOfGivenArgs = form.length - 1
  if (hasRestParam) {
    if (numOfGivenArgs < nOfParams)
      throw new CompileError(`expected at least ${nOfParams} arguments, got ${numOfGivenArgs}`, form)
  } else {
    if (numOfGivenArgs !== nOfParams)
      throw new CompileError(`expected ${nOfParams} arguments, got ${numOfGivenArgs}`, form)
  }
}

const makeInterpreterContext = (defVars, externalModules) => {
  if (!externalModules) externalModules = new Map()
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
        if (!defVars.has(varName)) throw new CompileError('not found: ' + varName, form)
        const defVar = defVars.get(varName)
        const defVarVal = defVar.value
        return () => defVarVal
      }
    }
    // do not allow non-forms
    if (!isList(form)) throw new CompileError('not a form', form)
    if (form.length === 0) return () => undefined
    const [firstForm, ...args] = form
    const firstWordValue = tryGetWordValue(firstForm)
    switch (firstWordValue) {
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
        Object.freeze(params)
        const varDescs = new Map()
        const paramDesc = { defForm: firstWordValue }
        for (const p of params) varDescs.set(p, paramDesc)
        if (restParam) varDescs.set(restParam, paramDesc)
        const nOfParams = params.length
        const hasRestParam = !!parsedParams.restParam
        const newCtx = { varDescs, outer: null, ctxType: firstWordValue, nOfParams, hasRestParam }
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
        const f = createArityFunctionWrapper(nOfParams, hasRestParam)(body)
        setJSFunctionName(f, strFuncName)
        if (hasRestParam) f.hasRestParam = hasRestParam
        Object.freeze(f)
        // for recursive calls
        newCtx.func = f
        Object.freeze(newCtx)
        return () => f
      }
      case 'recur': {
        let curCtx = ctx
        while (curCtx.outer) curCtx = curCtx.outer
        checkCallArity(curCtx.nOfParams, curCtx.hasRestParam, form)
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => curCtx.func(...cargs.map((carg) => carg(env)))
      }
      case 'def': {
        if (args.length !== 2) throw new CompileError('def expects 2 arguments', form)
        const [varName, value] = args
        const v = ctWordValue(varName)
        const cvalue = compile(ctx, value)
        return (env) => {
          const eValue = cvalue(env)
          const varObject = defVar(v, eValue)
          insertDefVar(varObject)
          return undefined
        }
      }
      case 'def-with-meta': {
        if (args.length !== 3) throw new CompileError('def expects 3 arguments', form)
        const [varName, metaForm, value] = args
        const v = ctWordValue(varName)
        const cmetaData = compile(ctx, metaForm)
        const cvalue = compile(ctx, value)
        return (env) => {
          const md = cmetaData(env)
          const eValue = cvalue(env)
          insertDefVar(defVarWithMeta(v, eValue, md))
          return undefined
        }
      }
      case 'extern': {
        if (args.length !== 3) throw new CompileError('extern expects 3 arguments', form)
        const [moduleName, name, type] = args
        const modName = ctWordValue(moduleName)
        const nameStr = ctWordValue(name)
        if (!isList(type)) throw new CompileError('extern expects list as type', form)
        if (type.length !== 3) throw new CompileError('extern expects type of length 3', form)
        const [funcWord, paramTypes, result] = type
        if (ctWordValue(funcWord) !== 'func') throw new CompileError('extern expects func type', form)
        if (!isList(paramTypes)) throw new CompileError('extern expects list as params', form)
        const parsedParams = parseParams(paramTypes)
        const module = externalModules.get(modName)
        if (!module) throw new CompileError(`module ${modName} not found`, form)
        const extern = module[nameStr]
        if (!extern) throw new CompileError(`extern ${nameStr} not found in module ${modName}`, form)
        if (typeof extern !== 'function') throw new CompileError(`extern ${nameStr} is not a function`, form)
        // wrap so we don't change input functions
        const nOfParams = parsedParams.params.length
        const hasRestParam = !!parsedParams.restParam
        const wrapper = createArityFunctionWrapper(nOfParams, hasRestParam)((...args) => extern(...args))
        if (hasRestParam) wrapper.hasRestParam = hasRestParam
        setJSFunctionName(wrapper, nameStr)
        Object.freeze(wrapper)
        return () => wrapper
      }
    }
    // direct function call or function in parameter/local variable
    if (!firstWordValue || hasCtxVar(ctx, firstWordValue)) {
      const cfunc = compile(ctx, firstForm)
      const cargs = args.map((a) => compile(ctx, a))
      return (env) => {
        const f = cfunc(env)
        if (typeof f !== 'function') throw new RuntimeError(`expected function, got ${f}`)
        const { length, hasRestParam } = f
        if (length !== undefined) {
          if (hasRestParam) {
            if (args.length < length)
              throw new RuntimeError(`expected at least ${length} arguments, got ${args.length}`, form)
          } else {
            if (args.length !== length) throw new RuntimeError(`expected ${length} arguments, got ${args.length}`, form)
          }
        } else {
          // non wuns functions are assumed to not have rest param
          if (args.length !== f.length)
            throw new RuntimeError(`expected ${f.length} arguments, got ${args.length}`, form)
        }
        return f(...cargs.map((carg) => carg(env)))
      }
    }
    if (defVars.has(firstWordValue)) {
      const funcOrMacVar = defVars.get(firstWordValue)
      const varMeta = meta(funcOrMacVar)
      const func = funcOrMacVar.value
      if (typeof func !== 'function') throw new CompileError(`expected function, got ${func}`, form)
      checkCallArity(func.length, func.hasRestParam, form)
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
            throw new RuntimeError(`runtime error when calling function '${firstWordValue}': ${e.message}`, form, e)
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
              throw new RuntimeError(
                `compiletime error when calling manc '${firstWordValue}': ${error.message}`,
                form,
                e,
              )
            throw e
          }
        }
      }
      throw new CompileError(`unreachable, invalid function/macro/fexpr/manc combination for '${firstWordValue}'`, form)
    }
    const instruction = instructions[firstWordValue]
    if (!instruction) throw new CompileError(`function '${firstWordValue}' not found`, form)
    const { immediateParams, params, func } = instruction
    const immArity = immediateParams.length
    if (args.length < immArity)
      throw new CompileError(`instruction ${firstWordValue} expected at least ${immArity} arguments`)
    // maybe we should allow number immediates to for convenience
    const immArgs = args.slice(0, immArity).map((arg) => {
      const wv = ctWordValue(arg)
      const n = Number(wv)
      if (!isSigned32BitInteger(n)) throw new CompileError(`expected 32-bit signed integer, found: ${wv}`, arg)
      return n
    })
    for (let i = 0; i < immArity; i++) {
      const immArg = immArgs[i]
      if (!Number.isInteger(immArg)) throw new CompileError(`invalid immediate param ${immArg}`, immArg)
      switch (immediateParams[i]) {
        case 'u32':
          if (immArg < 0 || immArg > 2 ** 32 - 1) throw new CompileError(`invalid immediate param ${immArg}`, immArg)
          break
        case 's32':
          if (!isSigned32BitInteger(immArg)) throw new CompileError(`invalid immediate param ${immArg}`, immArg)
          break
        case 's64':
          // if (!isSigned32BitInteger(immArg)) throw new CompileError(`invalid immediate param ${immArg}`, immArg)
          try {
            BigInt(immArg)
          } catch (e) {
            throw new CompileError(`invalid immediate param ${immArg}`, immArg)
          }
          break
        default:
          throw new CompileError(`invalid immediate param type ${immediateParams[i]}`)
      }
    }
    const instWithImmediate = func(...immArgs)
    const cargs = args.slice(immArity).map((a) => compile(ctx, a))
    if (cargs.length !== params.length)
      throw new CompileError(
        `instruction ${firstWordValue} expected ${params.length} non-immediate arguments, got ${cargs.length}`,
        form,
      )
    return (env) => {
      const eargs = cargs.map((carg) => carg(env))
      for (const earg of eargs)
        if (!isSigned32BitInteger(earg))
          throw new RuntimeError(`instruction ${firstWordValue} expected integer, got ${earg}`, form)
      try {
        return instWithImmediate(...eargs)
      } catch (e) {
        throw new RuntimeError(`runtime error when calling instruction '${firstWordValue}': ${e.message}`, form, e)
      }
    }
  }
  const compileTop = (form) => {
    const compRes = compile(null, form)
    const evaluate = () => compRes(null)
    return evaluate
  }
  return compileTop
}

export const getFormLocation = (subForm) => (subForm ? meta(subForm).location : undefined) || 'unknown location'

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

import { wordValue } from './core.js'
const hostExports = Object.entries(await import('./host.js')).map(([name, f]) => [name.replace(/_/g, '-'), f])
// const hostExportsMap = new Map(hostExports)

export const hostFuncTypes = parseFile('../wuns/host-funcs.wuns')
const hostFuncTypesMap = new Map()
for (const form of hostFuncTypes) {
  if (!isList(form)) throw new Error('expected list')
  if (form.length !== 3) throw new Error('expected list of length 3')
  const [name, paramTypes, resultTypes] = form
  if (!isList(paramTypes)) throw new Error('expected list')
  if (!isList(resultTypes)) throw new Error('expected list')
  const fname = wordValue(name)
  // if (!hostExportsMap.has(fname)) throw new Error(`type definition ${fname} has no host.js export`)
  hostFuncTypesMap.set(fname, { paramTypes, resultTypes })
}

for (const [name, f] of hostExports) {
  const hostFunc = hostFuncTypesMap.get(name)
  if (!hostFunc) throw new Error(`host function ${name} not found in host-funcs.wuns`)
  if (hostFunc.paramTypes.length !== f.length)
    throw new Error(`function ${name} expected ${hostFunc.paramTypes.length} params, got ${f.length}`)
}

export const makeInitContext = () => {
  const makeEvalContext = () => {
    const { compile } = makeInitContext()
    const evaluate = (form) => {
      const cform = compile(form)
      return cform()
    }
    return evaluate
  }
  const hostObj = {}
  const insertFunc = (name, f) => {
    if (name in hostObj) throw new Error(`redefining var: ${name}`)
    const hostFuncType = hostFuncTypesMap.get(name)
    const { paramTypes, resultTypes } = hostFuncType
    const numParams = paramTypes.length
    hostObj[name] = f
  }
  for (const [name, f] of hostExports) insertFunc(name, f)
  insertFunc('make-eval-context', makeEvalContext)
  insertFunc('try-get-var', (name) => {
    const v = defVars.get(wordValue(name))
    if (v) return v
    return 0
  })
  const defVars = new Map()
  const moduleMap = new Map()
  const compile = makeInterpreterContext(defVars, moduleMap)
  insertFunc('eval', (form) => {
    const cform = compile(form)
    return cform()
  })

  moduleMap.set('host', hostObj)

  return { compile }
}

export const evalLogForms = (compile, forms) => {
  const compiled = []
  for (const form of forms) {
    try {
      compiled.push(compile(form))
    } catch (e) {
      if (e instanceof CompileError) {
        console.error(`compile error in ${getFormLocation(e.form || form)}: ${e.message}`)
        return undefined
      }
      throw e
    }
  }
  for (const cform of compiled) {
    try {
      const v = cform()
      if (v !== undefined) console.log(print(v))
    } catch (e) {
      if (e instanceof RuntimeError) {
        console.error(`runtime error in ${getFormLocation(e.form || form)}: ${e.message}`)
        return undefined
      }
      throw new Error(`unexpected non-runtime error: ${e.message}`)
    }
  }
}

export const parseEvalFiles = (compile, filenames) => {
  for (const filename of filenames) {
    const forms = parseFile(filename)
    for (const form of forms) {
      let cform
      try {
        cform = compile(form)
      } catch (e) {
        if (e instanceof CompileError) {
          console.error(`compile error in ${getFormLocation(e.form || form)}: ${e.message}`)
          console.error(e)
        } else {
          console.error(`unexpected non-compile error: ${e.message}`)
        }
        throw e
      }
      try {
        cform(null)
      } catch (e) {
        if (e instanceof RuntimeError) {
          console.error(`runtime error in ${getFormLocation(e.form || form)}: ${e.message}`)
          console.error(e)
        } else {
          console.error(`unexpected non-runtime error: ${e.message}`)
        }
        throw e
      }
    }
  }
}
