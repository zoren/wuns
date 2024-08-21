import {
  isWord,
  isList,
  print,
  isSigned32BitInteger,
  meta,
  makeList,
  isForm,
  isDefVar,
  defVar,
  defVarWithMeta,
} from './core.js'
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

export const makeInterpreterContext = (defVars) => {
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
      case 'defunc': {
        const [fmname, origParams, metaForm, ...bodies] = args
        const strFuncName = ctWordValue(fmname)
        let params = origParams.map(ctWordValue)
        let restParam = null
        if (params.length > 1 && params.at(-2) === '..') {
          restParam = params.at(-1)
          params = params.slice(0, -2)
        }
        Object.freeze(params)
        const cmetaData = compile(ctx, metaForm)
        const varDescs = new Map()
        const paramDesc = { defForm: firstWordValue }
        for (const p of params) varDescs.set(p, paramDesc)
        if (restParam) varDescs.set(restParam, paramDesc)
        const funMacDesc = {
          params,
          restParam,
        }
        const newCtx = { varDescs, outer: null, ctxType: firstWordValue, funMacDesc }
        const cbodies = compBodies(newCtx, bodies)
        const arity = params.length
        const f = restParam
          ? (...args) => {
              const varValues = new Map()
              for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
              varValues.set(restParam, makeList(...args.slice(arity)))
              return cbodies({ varValues })
            }
          : (...args) => {
              const varValues = new Map()
              for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
              return cbodies({ varValues })
            }
        Object.freeze(f)
        // for recursive calls
        funMacDesc.func = f
        Object.freeze(funMacDesc)
        const hasRestParam = restParam === null ? 0 : 1
        return (env) => {
          const md = cmetaData(env)
          const varObject = defVarWithMeta(strFuncName, f, {
            ...md,
            'n-of-params': params.length,
            'has-rest-param': hasRestParam,
          })
          insertDefVar(varObject)
          return f
        }
      }
      case 'recur': {
        let curCtx = ctx
        while (curCtx.outer) curCtx = curCtx.outer
        const funMacDesc = curCtx.funMacDesc
        if (!funMacDesc) throw new CompileError('recur outside of function', form)
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => funMacDesc.func(...cargs.map((carg) => carg(env)))
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
    }
    // direct function call or function in parameter/local variable
    if (!firstWordValue || hasCtxVar(ctx, firstWordValue)) {
      const cfunc = compile(ctx, firstForm)
      const cargs = args.map((a) => compile(ctx, a))
      return (env) => {
        const f = cfunc(env)
        if (typeof f !== 'function') throw new RuntimeError(`expected function, got ${f}`)
        return f(...cargs.map((carg) => carg(env)))
      }
    }
    if (defVars.has(firstWordValue)) {
      const funcOrMacVar = defVars.get(firstWordValue)
      const varMeta = meta(funcOrMacVar)
      const nOfParams = varMeta['n-of-params']
      if (nOfParams === undefined) throw new CompileError(`expected function/macro/fexpr/manc, got variable`, form)
      const hasRestParam = varMeta['has-rest-param']
      if (hasRestParam) {
        if (args.length < nOfParams)
          throw new CompileError(
            `function '${firstWordValue}' expected at least ${nOfParams} arguments, got ${args.length}`,
            form,
          )
      } else {
        if (args.length !== nOfParams)
          throw new CompileError(
            `function '${firstWordValue}' expected ${nOfParams} arguments, got ${args.length}`,
            form,
          )
      }
      const noEvalArgs = varMeta['no-eval-args']
      const evalResult = varMeta['eval-result']
      const funcOrMac = funcOrMacVar.value
      if (typeof funcOrMac !== 'function') throw new CompileError(`expected function, got ${funcOrMac}`, form)
      // function, eval args and don't eval result
      if (!noEvalArgs && !evalResult) {
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => funcOrMac(...cargs.map((carg) => carg(env)))
      }
      // macro, don't eval args and eval result
      if (noEvalArgs && evalResult) {
        let macroResult
        try {
          macroResult = funcOrMac(...args)
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
        const fexprResult = funcOrMac(...args)
        return () => fexprResult
      }
      // manc, eval args and eval result
      if (!noEvalArgs && evalResult) {
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => {
          const mancResult = funcOrMac(...cargs.map((carg) => carg(env)))
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
      return instWithImmediate(...eargs)
    }
  }
  return (form) => compile(null, form)
}

export const getFormLocation = (subForm) => (subForm ? meta(subForm).location : undefined) || 'unknown location'

const compileForms = (compile, forms) => {
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
  return compiled
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

export const hostFuncs = parseFile('../wuns/host-funcs.wuns')
const hostFuncsMap = new Map()
for (const form of hostFuncs) {
  if (!isList(form)) throw new Error('expected list')
  if (form.length !== 3) throw new Error('expected list of length 3')
  const [name, paramTypes, resultTypes] = form
  if (!isList(paramTypes)) throw new Error('expected list')
  if (!isList(resultTypes)) throw new Error('expected list')
  hostFuncsMap.set(wordValue(name), { paramTypes, resultTypes })
}

import { wordValue } from './core.js'
const hostExports = Object.entries(await import('./host.js')).map(([name, f]) => [name.replace(/_/g, '-'), f])

export const makeInitContext = () => {
  const makeEvalContext = () => {
    const ctx = makeInitContext()
    return {
      compile: ctx.compile,
    }
  }
  const defVars = new Map()

  const insertFunc = (name, f) => {
    const hostFunc = hostFuncsMap.get(name)
    if (!hostFunc) throw new Error(`host function ${name} not found in host-funcs.wuns`)
    if (defVars.has(name)) throw new Error(`redefining var: ${name}`)
    defVars.set(name, defVarWithMeta(name, f, { 'n-of-params': hostFunc.paramTypes.length }))
  }
  for (const [name, f] of hostExports)
    insertFunc(name, f)

  insertFunc('make-eval-context', makeEvalContext)
  insertFunc('try-get-var', (name) => {
    const v = defVars.get(wordValue(name))
    if (v) return v
    return 0
  })
  const compile = makeInterpreterContext(defVars)
  return { compile, defVars }
}

export const evalLogForms = (ctx, forms) => {
  const compiled = compileForms(ctx, forms)
  if (!compiled) return
  for (const cform of compiled) {
    try {
      const v = cform()
      if (v !== undefined) console.log(print(v))
    } catch (e) {
      if (e instanceof RuntimeError) {
        console.error(`runtime error in ${getFormLocation(e.form)}: ${e.message}`)
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
          return undefined
        }
        console.error(`unexpected non-compile error: ${e.message}`)
        throw e
      }
      try {
        cform(null)
      } catch (e) {
        if (e instanceof RuntimeError) {
          console.error(`runtime error in ${getFormLocation(form)}: ${e.message}`)
          return undefined
        }
        console.error(`unexpected non-runtime error: ${e.message}`)
        throw e
      }
    }
  }
}
