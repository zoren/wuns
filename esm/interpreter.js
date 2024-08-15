import { isWord, print, isSigned32BitInteger, isWunsFunction, meta, makeList } from './core.js'
import { instructions } from './instructions.js'
import { parseFile } from './parseTreeSitter.js'

class RuntimeError extends Error {
  constructor(message, form) {
    super(message)
    this.form = form
  }
}

class CompileError extends Error {
  constructor(message, form) {
    super(message)
    this.form = form
  }
}

const hasCtxVar = (ctx, v) => {
  while (ctx) {
    if (ctx.varDescs.has(v)) return true
    ctx = ctx.outer
  }
  return false
}

export const isMacro = (form) => isWunsFunction(form) && form.funMacDesc.isMacro

const callFunctionStaged = (funMacDesc, numberOfGivenArgs, callForm) => {
  const { name, params, restParam } = funMacDesc
  const arity = params.length
  if (!restParam) {
    if (arity !== numberOfGivenArgs)
      throw new CompileError(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`, callForm)
    return (args) => {
      if (args.length !== numberOfGivenArgs)
        throw new RuntimeError('expected ' + numberOfGivenArgs + ' arguments', callForm)
      const varValues = new Map()
      for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
      return funMacDesc.cbodies({ varValues })
    }
  }
  if (arity > numberOfGivenArgs)
    throw new CompileError(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`, callForm)
  return (args) => {
    if (args.length !== numberOfGivenArgs)
      throw new RuntimeError('expected ' + numberOfGivenArgs + ' arguments', callForm)
    const varValues = new Map()
    for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
    varValues.set(restParam, makeList(...args.slice(arity)))
    return funMacDesc.cbodies({ varValues })
  }
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
        const defVarVal = defVars.get(varName)
        if (isMacro(defVarVal)) throw new CompileError(`can't take value of macro ${varName}`, form)
        return () => defVarVal
      }
    }
    // return non-forms as is
    if (!Array.isArray(form)) return () => form
    if (form.length === 0) return () => undefined
    const [firstForm, ...args] = form
    const firstWordValue = tryGetWordValue(firstForm)
    switch (firstWordValue) {
      case 'quote': {
        const res = args.length === 1 ? args[0] : makeList(...args)
        return () => res
      }
      case 'if': {
        if (args.length < 2 || 3 < args.length) throw new CompileError('if expects 2 or 3 arguments', form)
        const cc = compile(ctx, args[0])
        const ct = compile(ctx, args[1])
        if (args.length === 2) return (env) => (cc(env) === 0 ? undefined : ct(env))
        const cf = compile(ctx, args[2])
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
      case 'def': {
        if (args.length !== 2) throw new CompileError(`def expects 2 arguments, got ${args.length}`, form)
        const [varName, value] = args
        const vn = ctWordValue(varName)
        if (defVars.has(vn)) throw new CompileError(`redefining var: ${vn}`)
        const compValue = compile(ctx, value)
        defVars.set(vn, compValue(null))
        return (env) => {
          return undefined
        }
      }
      case 'func':
      case 'macro': {
        const [fmname, origParams, ...bodies] = args
        let params = origParams.map(ctWordValue)
        let restParam = null
        if (params.length > 1 && params.at(-2) === '..') {
          restParam = params.at(-1)
          params = params.slice(0, -2)
        }
        Object.freeze(params)
        const varDescs = new Map()
        const paramDesc = { defForm: firstWordValue }
        for (const p of params) varDescs.set(p, paramDesc)
        if (restParam) varDescs.set(restParam, paramDesc)
        const funMacDesc = {
          name: fmname,
          params,
          restParam,
        }
        const newCtx = { varDescs, outer: null, ctxType: firstWordValue, funMacDesc }
        funMacDesc.cbodies = compBodies(newCtx, bodies)
        if (firstWordValue === 'macro') funMacDesc.isMacro = true
        Object.freeze(funMacDesc)
        const f = (...args) => callFunctionStaged(funMacDesc, args.length)(args)
        f['funMacDesc'] = funMacDesc
        Object.freeze(f)
        return () => f
      }
      case 'recur': {
        let curCtx = ctx
        while (curCtx.outer) curCtx = curCtx.outer
        if (!curCtx.funMacDesc) throw new CompileError('recur outside of function', form)
        const caller = callFunctionStaged(curCtx.funMacDesc, args.length, form)
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => caller(cargs.map((carg) => carg(env)))
      }
    }
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
      const funcOrMac = defVars.get(firstWordValue)
      if (isWunsFunction(funcOrMac)) {
        const { funMacDesc } = funcOrMac
        const caller = callFunctionStaged(funMacDesc, args.length, form)
        if (isMacro(funcOrMac)) {
          let macroResult
          try {
            macroResult = caller(args)
          } catch (error) {
            if (error instanceof RuntimeError)
              throw new CompileError(`error when calling macro '${firstWordValue}': ${error.message}`, form)
            throw error
          }
          return compile(ctx, macroResult)
        }
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => caller(cargs.map((carg) => carg(env)))
      }
      if (typeof funcOrMac !== 'function') throw new CompileError(`expected function, got ${funcOrMac}`, form)
      // here we check arity statically
      if (funcOrMac.length !== args.length)
        throw new CompileError(
          `function '${firstWordValue}' expected ${funcOrMac.length} arguments, got ${args.length}`,
          form,
        )
      const cargs = args.map((a) => compile(ctx, a))
      return (env) => {
        const eargs = cargs.map((carg) => carg(env))
        try {
          return funcOrMac(...eargs)
        } catch (error) {
          throw new RuntimeError(`error in function call: ${error.message}`, form)
        }
      }
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

export const hostExports = Object.entries(await import('./host.js')).map(([name, f]) => [name.replace(/_/g, '-'), f])

export const getFormLocation = (subForm) => meta(subForm).location || 'unknown location'

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
      console.error(`runtime error in ${getFormLocation(e.form || form)}: ${e.message}`)
      return undefined
    }
    throw new Error(`unexpected non-runtime error: ${e.message}`)
  }
}

export const addHostFunctions = (defVars) => {
  for (const [name, f] of hostExports) defVars.set(name, f)
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

export const parseEvalFile = (compile, filename) => {
  const compiled = compileForms(compile, parseFile(filename))
  if (!compiled) return
  for (const cform of compiled) {
    try {
      return cform(null)
    } catch (e) {
      if (e instanceof RuntimeError) {
        console.error(`runtime error in ${getFormLocation(e.form)}: ${e.message}`)
        return undefined
      }
      throw new Error(`unexpected non-runtime error: ${e.message}`)
    }
  }
}
