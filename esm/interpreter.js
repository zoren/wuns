import {
  wordValue,
  isWord,
  isUnit,
  unit,
  print,
  number,
  meta,
  callClosure,
  callClosureStaged,
  isSigned32BitInteger,
  createClosure,
  isClosure,
} from './core.js'
import { instructions } from './instructions.js'
import { parseFile } from './parseTreeSitter.js'

class RuntimeError extends Error {
  constructor(message, form) {
    super(message)
    this.form = form
  }
}

const rtAssert = (cond, msg) => {
  if (!cond) throw new RuntimeError('eval assert failed: ' + msg)
}

class CompileError extends Error {
  constructor(message, form) {
    super(message)
    this.form = form
  }
}

const ctAssert = (cond, msg) => {
  if (!cond) throw new CompileError('compile assert failed: ' + msg)
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

const hostExports = Object.entries(await import('./host.js')).map(([name, f]) => [name.replace(/_/g, '-'), f])
const isMacro = (form) => meta(form)['is-macro']

export const makeInterpreterContext = () => {
  const wunsEval = (form) => wunsComp(null, form)(null)
  const defVars = new Map()
  const getDefVarVal = (name) => {
    if (!defVars.has(name)) throw new Error('getDefVarVal name not found: ' + name)
    return defVars.get(name)
  }
  const defSetVar = (name, value) => {
    if (defVars.has(name)) throw new RuntimeError(`defSetVar redefining var: ${name}`)
    defVars.set(name, value)
    return null
  }
  defSetVar('eval', wunsEval)

  for (const [name, f] of hostExports) defSetVar(name, f)

  const compBodies = (ctx, bodies) => {
    const cbodies = []
    for (const body of bodies) cbodies.push(wunsComp(ctx, body))
    return (env) => {
      let result = unit
      for (const cbody of cbodies) result = cbody(env)
      return result
    }
  }
  const compSpecialForm = (ctx, [firstForm, ...args]) => {
    if (!isWord(firstForm)) return null
    const firstWordValue = wordValue(firstForm)
    switch (firstWordValue) {
      case 'quote': {
        const res = args.length === 1 ? args[0] : Object.freeze(args)
        return () => res
      }
      case 'if': {
        const ifArgs = [...args, unit, unit, unit].slice(0, 3)
        let [cc, ct, cf] = ifArgs.map((arg) => wunsComp(ctx, arg))
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
        const newCtx = { varDescs, outer: ctx, ctxType: wordValue(firstForm) }
        const varDesc = { defForm: firstForm }
        for (let i = 0; i < bindings.length - 1; i += 2) {
          const v = wordValue(bindings[i])
          compBindings.push([v, wunsComp(newCtx, bindings[i + 1])])
          varDescs.set(v, varDesc)
        }
        const cbodies = compBodies(newCtx, bodies)
        if (firstWordValue === 'let')
          return (env) => {
            const varValues = new Map()
            const inner = { varValues, outer: env }
            for (const [varName, compVal] of compBindings) varValues.set(varName, compVal(inner))
            return cbodies(inner)
          }

        return (env) => {
          const varValues = new Map()
          const inner = { varValues, outer: env, loop: true, continue: true }
          for (const [varName, compVal] of compBindings) varValues.set(varName, compVal(inner))
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
          ctAssert(enclosingLoopCtx, 'continue outside of loop')
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
            rtAssert(enclosingLoopEnv, 'continue outside of loop')
            if (enclosingLoopEnv.loop) break
            enclosingLoopEnv = enclosingLoopEnv.outer
          }
          const { varValues } = enclosingLoopEnv
          // it's important to evaluate all the update functions before updating the variables as they might depend on each other
          const tmpVals = updateFuncs.map((f) => f(env))
          for (let i = 0; i < updateVars.length; i++) varValues.set(updateVars[i], tmpVals[i])
          enclosingLoopEnv.continue = true
          return unit
        }
      }
      case 'def': {
        ctAssert(args.length === 2, `def expects 2 arguments, got ${args.length}`)
        const [varName, value] = args
        const vn = wordValue(varName)
        const compValue = wunsComp(ctx, value)
        return (env) => {
          const val = compValue(env)
          defSetVar(vn, val)
          return unit
        }
      }
      case 'func': {
        const [fmname, origParams, ...bodies] = args
        let params = origParams.map(wordValue)
        let restParam = null
        if (params.length > 1 && params.at(-2) === '..') {
          restParam = params.at(-1)
          params = params.slice(0, -2)
        }
        Object.freeze(params)
        const varDescs = new Map()
        const paramDesc = { defForm: firstForm }
        for (const p of params) varDescs.set(p, paramDesc)
        if (restParam) varDescs.set(restParam, paramDesc)
        const funMacDesc = {
          name: fmname,
          params,
          restParam,
        }
        const newCtx = { varDescs, outer: ctx, ctxType: wordValue(firstForm), funMacDesc }
        funMacDesc.cbodies = compBodies(newCtx, bodies)
        Object.freeze(funMacDesc)
        return (env) => createClosure(funMacDesc, env)
      }
      case 'recur': {
        let curCtx = ctx
        while (true) {
          if (!curCtx) throw new CompileError('recur outside of function context')
          if (curCtx.ctxType === 'func') {
            const { funMacDesc } = curCtx
            const cargs = args.map((a) => wunsComp(ctx, a))
            return (env) =>
              callClosure(
                createClosure(funMacDesc, env),
                cargs.map((carg) => carg(env)),
              )
          }
          curCtx = curCtx.outer
        }
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
          if (isClosure(f)) return callClosure(f, eargs)
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
    const cspec = compSpecialForm(ctx, form)
    if (cspec) return cspec
    const firstWordValue = wordValue(firstForm)
    if (getCtxVar(ctx, firstWordValue)) {
      const caller = rtCallFunc()
      return (env) => caller(getVarValue(env, firstWordValue), env)
    }
    if (defVars.has(firstWordValue)) {
      const funcOrMac = getDefVarVal(firstWordValue)
      if (isClosure(funcOrMac)) {
        if (isMacro(funcOrMac)) return wunsComp(ctx, callClosure(funcOrMac, args))
        const caller = callClosureStaged(funcOrMac.funMacDesc, args.length)
        const cargs = args.map((a) => wunsComp(ctx, a))
        return (env) =>
          caller(
            env,
            cargs.map((carg) => carg(env)),
          )
      }
      if (typeof funcOrMac !== 'function') throw new CompileError(`expected function, got ${funcOrMac}`)
      // here we can check arity statically
      if (!funcOrMac.varargs) {
        const arity = funcOrMac.length
        if (arity !== args.length)
          throw new CompileError(`function '${firstWordValue}' expected ${arity} arguments, got ${args.length}`)
      }
      const caller = rtCallFunc()
      return (env) => caller(funcOrMac, env)
    }
    const instruction = instructions[firstWordValue]
    if (!instruction) throw new CompileError(`function ${firstWordValue} not found ${print(form)}`)
    const { immediateParams, params, func } = instruction
    const immArity = immediateParams.length
    if (args.length < immArity) throw new CompileError(`instruction ${firstWordValue} expected at least ${immArity} arguments`)
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
      throw new CompileError(`instruction ${firstWordValue} expected ${params.length} non-immediate arguments, got ${cargs.length}`)
    return (env) => {
      const eargs = cargs.map((carg) => carg(env))
      for (const earg of eargs) if (!isSigned32BitInteger(earg)) throw new RuntimeError(`expected integer, got ${earg}`)
      return instWithImmediate(...eargs)
    }
  }

  const evalLogForms = (forms) => {
    for (const form of forms) {
      const v = wunsEval(form)
      if (!isUnit(v)) console.log(print(v))
    }
  }

  const parseEvalFile = (filename) => {
    evalLogForms(parseFile(filename))
  }
  return {
    evalLogForms,
    parseEvalFile,
    getVarVal: getDefVarVal,
    defSetVar,
  }
}
