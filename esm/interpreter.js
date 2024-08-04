import {
  wordValue,
  isWord,
  unit,
  print,
  number,
  isSigned32BitInteger,
  createFunction,
  callFunction,
  callFunctionStaged,
  isWunsFunction,
} from './core.js'
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

const getVarValue = (env, v) => {
  while (true) {
    if (!env) throw new RuntimeError(`variable ${v} not found`)
    const { varValues } = env
    if (env && varValues.has(v)) return varValues.get(v)
    env = env.outer
  }
}

const getCtxVar = (ctx, v) => {
  while (true) {
    if (!ctx) return null
    const { varDescs } = ctx
    if (varDescs.has(v)) return varDescs.get(v)
    ctx = ctx.outer
  }
}

export const isMacro = (form) => isWunsFunction(form) && form.funMacDesc.isMacro

export const makeInterpreterContext = () => {
  const defVars = new Map()
  const getDefVarVal = (name) => {
    if (!defVars.has(name)) throw new CompileError('getDefVarVal name not found: ' + name)
    return defVars.get(name)
  }
  const defSetVar = (name, value) => {
    if (defVars.has(name)) throw new RuntimeError(`defSetVar redefining var: ${name}`)
    defVars.set(name, value)
    return value
  }
  const compBodies = (ctx, bodies) => {
    const cbodies = bodies.map((body) => wunsComp(ctx, body))
    return (env) => {
      let result = undefined
      for (const cbody of cbodies) result = cbody(env)
      return result
    }
  }
  const compSpecialForm = (ctx, firstWordValue, args) => {
    switch (firstWordValue) {
      case 'quote': {
        const res = args.length === 1 ? args[0] : Object.freeze(args)
        return () => res
      }
      case 'if': {
        const ifArgs = [...args, unit, unit, unit].slice(0, 3)
        const [cc, ct, cf] = ifArgs.map((arg) => wunsComp(ctx, arg))
        return (env) => {
          const ec = cc(env)
          if (!isSigned32BitInteger(ec)) throw new RuntimeError(`if expected number, got ${ec}`)
          return (ec === 0 ? cf : ct)(env)
        }
      }
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const compBindings = []
        const varDescs = new Map()
        const newCtx = { varDescs, outer: ctx, ctxType: firstWordValue }
        const varDesc = { defForm: firstWordValue }
        for (let i = 0; i < bindings.length - 1; i += 2) {
          const v = wordValue(bindings[i])
          compBindings.push([v, wunsComp(newCtx, bindings[i + 1])])
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
          updateVars.push(wordValue(args[i]))
          updateFuncs.push(wunsComp(ctx, args[i + 1]))
        }
        let enclosingLoopCtx = ctx
        while (true) {
          if (!enclosingLoopCtx) throw new CompileError('continue outside of loop')
          if (enclosingLoopCtx.ctxType === 'loop') break
          enclosingLoopCtx = enclosingLoopCtx.outer
        }
        for (const uv of updateVars) {
          if (!enclosingLoopCtx.varDescs.has(uv))
            throw new CompileError(`loop variable ${uv} not found in loop context`)
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
        if (args.length !== 2) throw new CompileError(`def expects 2 arguments, got ${args.length}`)
        const [varName, value] = args
        const vn = wordValue(varName)
        const compValue = wunsComp(ctx, value)
        return (env) => defSetVar(vn, compValue(env))
      }
      case 'defn':
      case 'defmacro': {
        const [fmname, origParams, ...bodies] = args
        const nameString = wordValue(fmname)
        let params = origParams.map(wordValue)
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
        if (firstWordValue === 'defmacro') funMacDesc.isMacro = true
        Object.freeze(funMacDesc)
        const f = createFunction(funMacDesc)
        return () => defSetVar(nameString, f)
      }
      case 'recur': {
        let curCtx = ctx
        while (curCtx.outer) {
          curCtx = curCtx.outer
        }
        const caller = callFunctionStaged(curCtx.funMacDesc, args.length)
        const cargs = args.map((a) => wunsComp(ctx, a))
        return (env) => caller(cargs.map((carg) => carg(env)))
      }
    }
    return null
  }
  const wunsComp = (ctx, form) => {
    if (isWord(form)) {
      const v = wordValue(form)
      if (getCtxVar(ctx, v)) return (env) => getVarValue(env, v)
      const defVarVal = getDefVarVal(v)
      if (isMacro(defVarVal)) throw new CompileError(`can't take value of macro ${v}`)
      return () => defVarVal
    }
    // return non-forms as is
    if (!Array.isArray(form)) return () => form
    // todo maybe change this a tuple unit not an empty list
    if (form.length === 0) return () => unit
    const [firstForm, ...args] = form
    const rtCallFunc = () => {
      const cargs = args.map((a) => wunsComp(ctx, a))
      return (f, env) => {
        const eargs = cargs.map((carg) => carg(env))
        try {
          if (isWunsFunction(f)) return callFunction(f.funMacDesc, eargs)
          if (typeof f === 'function') return f(...eargs)
          throw new RuntimeError(`expected function, got ${f}`)
        } catch (e) {
          console.error('error in rtCallFunc', e, form)
          throw e
        }
      }
    }
    if (!isWord(firstForm)) {
      const cfunc = wunsComp(ctx, firstForm)
      const caller = rtCallFunc()
      return (env) => caller(cfunc(env), env)
    }
    const firstWordValue = wordValue(firstForm)
    const cspec = compSpecialForm(ctx, firstWordValue, args)
    if (cspec) return cspec
    if (getCtxVar(ctx, firstWordValue)) {
      const caller = rtCallFunc()
      return (env) => caller(getVarValue(env, firstWordValue), env)
    }
    if (defVars.has(firstWordValue)) {
      const funcOrMac = getDefVarVal(firstWordValue)
      if (isWunsFunction(funcOrMac)) {
        const { funMacDesc } = funcOrMac
        if (isMacro(funcOrMac)) return wunsComp(ctx, callFunction(funMacDesc, args))
        const caller = callFunctionStaged(funMacDesc, args.length)
        const cargs = args.map((a) => wunsComp(ctx, a))
        return (env) => caller(cargs.map((carg) => carg(env)))
      }
      if (typeof funcOrMac !== 'function') throw new CompileError(`expected function, got ${funcOrMac}`)
      // here we check arity statically
      if (!funcOrMac.varargs && funcOrMac.length !== args.length)
        throw new CompileError(
          `function '${firstWordValue}' expected ${funcOrMac.length} arguments, got ${args.length}`,
        )
      const cargs = args.map((a) => wunsComp(ctx, a))
      return (env) => funcOrMac(...cargs.map((carg) => carg(env)))
    }
    const instruction = instructions[firstWordValue]
    if (!instruction) throw new CompileError(`function '${firstWordValue}' not found ${print(form)}`)
    const { immediateParams, params, func } = instruction
    const immArity = immediateParams.length
    if (args.length < immArity)
      throw new CompileError(`instruction ${firstWordValue} expected at least ${immArity} arguments`)
    // maybe we should allow number immediates to for convenience
    const immArgs = args.slice(0, immArity).map(number)
    for (let i = 0; i < immArity; i++) {
      const immArg = immArgs[i]
      if (!Number.isInteger(immArg)) throw new CompileError(`invalid immediate param ${immArg}`)
      switch (immediateParams[i]) {
        case 'u32':
          if (immArg < 0 || immArg > 2 ** 32 - 1) throw new CompileError(`invalid immediate param ${immArg}`)
          break
        case 's32':
          if (!isSigned32BitInteger(immArg)) throw new CompileError(`invalid immediate param ${immArg}`)
          break
        default:
          throw new CompileError(`invalid immediate param type ${immediateParams[i]}`)
      }
    }
    const instWithImmediate = func(...immArgs)
    const cargs = args.slice(immArity).map((a) => wunsComp(ctx, a))
    if (cargs.length !== params.length)
      throw new CompileError(
        `instruction ${firstWordValue} expected ${params.length} non-immediate arguments, got ${cargs.length}`,
      )
    return (env) => {
      const eargs = cargs.map((carg) => carg(env))
      for (const earg of eargs) if (!isSigned32BitInteger(earg)) throw new RuntimeError(`expected integer, got ${earg}`)
      return instWithImmediate(...eargs)
    }
  }
  const compileForm = (form) => wunsComp(null, form)
  const evalForm = (form) => compileForm(form)(null)
  return {
    getVarVal: getDefVarVal,
    defSetVar,
    compileForm,
    evalForm,
  }
}

const hostExports = Object.entries(await import('./host.js')).map(([name, f]) => [name.replace(/_/g, '-'), f])

export const makeInitInterpreter = () => {
  const ctx = makeInterpreterContext()
  const { defSetVar, evalForm } = ctx
  defSetVar('eval', evalForm)
  for (const [name, f] of hostExports) defSetVar(name, f)
  return ctx
}

export const evalLogForms = ({ evalForm }, forms) => {
  for (const form of forms) {
    const v = evalForm(form)
    if (v !== undefined) console.log(print(v))
  }
}

export const parseEvalFile = ({ evalForm }, filename) => {
  for (const form of parseFile(filename)) evalForm(form)
}
