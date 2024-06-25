import fs from 'fs'

import {
  wordValue,
  isWord,
  isList,
  isForm,
  isUnit,
  unit,
  print,
  number,
  word,
  makeVar,
  meta,
  callClosure,
} from './core.js'
import { instructions } from './instructions.js'
import { parseStringToForms } from './parseTreeSitter.js'

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

const jsToWuns = (js) => {
  if (isForm(js)) return js
  if (typeof js === 'boolean') return js ? word('1') : word('0')
  if (typeof js === 'string') return word(js)
  if (typeof js === 'number') return word(String(js))
  if (js === undefined) return unit
  return js
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

export const makeInterpreterContext = () => {
  const wunsEval = (form) => {
    const cform = wunsComp(null, form)
    return cform(null)
  }
  const varObjects = new Map()
  const getVarObject = (name) => varObjects.get(name)
  const defSetVar = (name, value) => {
    let v
    if (varObjects.has(name)) {
      v = varObjects.get(name)
    } else {
      v = makeVar(name)
      varObjects.set(name, v)
    }
    v.bind(value)
    return v
  }
  defSetVar('var', (vn) => getVarObject(wordValue(vn)))
  defSetVar('eval', wunsEval)

  const memories = []
  const addMemory = (memory) => {
    const index = memories.length
    memories.push(memory)
    return index
  }
  const instContext = { memories }

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
  const wunsComp = (ctx, form) => {
    if (isWord(form)) {
      const v = wordValue(form)
      const lvarctx = getCtxVar(ctx, v)
      if (lvarctx) return (env) => getVarValue(env, v)
      const varObj = getVarObject(v)
      if (!varObj) throw new CompileError(`variable ${v} not found ${meta(form)}`)
      if (meta(varObj)['is-macro']) throw new CompileError(`can't take value of macro ${v}`)
      return () => {
        rtAssert(varObj === getVarObject(v), `compile time var not same as runtime varObj !== getVarObject(v)`)
        return varObj.getValue()
      }
    }
    // maybe we should just return non lists as is?
    ctAssert(isList(form), `cannot eval ${form} expected word or list`)
    if (form.length === 0) return () => unit
    const [firstForm, ...args] = form
    const rtCallFunc = () => {
      const cargs = args.map((a) => wunsComp(ctx, a))
      return (f, env) => {
        const eargs = cargs.map((carg) => carg(env))
        if (typeof f === 'function') return jsToWuns(f(...eargs))
        return callClosure(f, eargs)
      }
    }
    if (!isWord(firstForm)) {
      const cfunc = wunsComp(ctx, firstForm)
      const caller = rtCallFunc()
      return (env) => caller(cfunc(env), env)
    }
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
          return (isWord(ec) && wordValue(ec) === '0' ? cf : ct)(env)
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
        const n = wordValue(fmname)
        let params = origParams
        let restParam = null
        if (origParams.length > 1 && wordValue(origParams.at(-2)) === '..') {
          params = origParams.slice(0, -2)
          restParam = wordValue(origParams.at(-1))
        }
        const varDescs = new Map()
        const paramDesc = { defForm: firstForm }
        for (const p of params) varDescs.set(wordValue(p), paramDesc)
        if (restParam) varDescs.set(restParam, paramDesc)
        const funMacDesc = {
          name: fmname,
          params: params.map(wordValue),
          restParam,
        }
        // for recursive calls
        varDescs.set(n, funMacDesc)
        const newCtx = { varDescs, outer: ctx, ctxType: wordValue(firstForm) }
        funMacDesc.cbodies = compBodies(newCtx, bodies)
        Object.freeze(funMacDesc)
        return (env) => {
          const varValues = new Map()
          const closure = { funMacDesc, closureEnv: { varValues, outer: env } }
          varValues.set(n, closure)
          return closure
        }
      }
    }
    if (getCtxVar(ctx, firstWordValue)) {
      const caller = rtCallFunc()
      return (env) => caller(getVarValue(env, firstWordValue), env)
    }
    const varObj = getVarObject(firstWordValue)
    if (varObj) {
      if (meta(varObj)['is-macro']) {
        const macResult = callClosure(varObj.getValue(), args)
        return wunsComp(ctx, macResult)
      }
      const caller = rtCallFunc()
      return (env) => caller(varObj.getValue(), env)
    }
    const instruction = instructions[firstWordValue]
    if (!instruction) throw new CompileError(`function ${firstWordValue} not found ${print(form)}`)
    if (typeof instruction === 'function') {
      const cargs = args.map((a) => wunsComp(ctx, a))
      return () => instruction(instContext, ...cargs.map((carg) => carg(env)))
    }
    const { immediateParams, params, func } = instruction
    const immArity = immediateParams.length
    const arity = immArity + params.length
    if (arity !== args.length)
      throw new CompileError(`function ${firstWordValue} expected ${arity} arguments, got ${args.length}`)
    const immArgs = args.slice(0, immArity).map(number)
    const nonImmArgs = args.slice(immArity)
    const funcWithImmediate = func(...immArgs)
    const cargs = nonImmArgs.map((a) => wunsComp(ctx, a))
    return (env) => funcWithImmediate(instContext, ...cargs.map((carg) => carg(env)))
  }

  const evalLogForms = (forms) => {
    try {
      for (const form of forms) {
        const v = wunsEval(form)
        if (!isUnit(v)) console.log(print(v))
      }
    } catch (e) {
      console.error('error evaluating', e)
    }
  }

  const parseEvalString = (content) => {
    evalLogForms(parseStringToForms(content))
  }

  const parseEvalFile = (filename) => {
    parseEvalString(fs.readFileSync(filename, 'ascii'))
  }

  return {
    evalLogForms,
    parseEvalString,
    parseEvalFile,
    addMemory,
  }
}
