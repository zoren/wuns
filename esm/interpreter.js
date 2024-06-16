import fs from 'fs'

import { makeList, wordValue, isWord, isList, isForm, isUnit, unit, print, number, word, is_atom } from './core.js'
import { parseStringToForms } from './parseTreeSitter.js'
import { i32binops } from './instructions.js'

const assert = (cond, msg) => {
  if (!cond) throw new Error('eval assert failed: ' + msg)
}

const jsToWuns = (js) => {
  if (isForm(js)) return js
  if (typeof js === 'boolean') return js ? word('1') : word('0')
  if (typeof js === 'string') return word(js)
  if (typeof js === 'number') return word(String(js))
  if (js === undefined) return unit
  if (is_atom(js)) return js
  if (Object.isFrozen(js)) return js
  throw new Error(`cannot convert ${js} of type ${typeof js} to wuns ${js.constructor.name}`)
}

const getVarValue = (env, v) => {
  while (true) {
    if (!env) throw new Error(`undefined runtime variable ${v}`)
    const { varValues } = env
    if (varValues.has(v)) return varValues.get(v)
    env = env.outer
  }
}
const getCtxVar = (ctx, v) => {
  while (true) {
    if (!ctx) throw new Error(`undefined context variable ${v}`)
    const { varDescs } = ctx
    if (varDescs.has(v)) return varDescs.get(v)
    ctx = ctx.outer
  }
}

const instructions = []
for (const [name, op] of Object.entries(i32binops)) {
  const opfn = Function('a', 'b', `return (a ${op} b) | 0`)
  instructions.push([name, (a, b) => opfn(number(a), number(b))])
}

const hostExports = Object.entries(await import('./host.js')).map(([name, f]) => [name.replace(/_/g, '-'), f])

export const makeContext = () => {
  const topVarValues = new Map()
  for (const [name, f] of instructions) topVarValues.set(name, f)
  for (const [name, f] of hostExports) topVarValues.set(name, f)

  const varDescs = new Map()
  for (const [name] of topVarValues) varDescs.set(name, { type: 'external-function' })
  const topCtx = { varDescs, outer: null }

  const topEnv = { varValues: topVarValues, outer: null }
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
      const desc = getCtxVar(ctx, v)
      if (desc.isMacro) throw new Error(`cannot eval macro ${v} as value`)
      return (env) => getVarValue(env, v)
    }
    assert(isList(form), `cannot eval ${form} expected word or list`)
    if (form.length === 0) return () => unit
    const [firstForm, ...args] = form
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
          const cv = cc(env)
          const wv = wordValue(cv)
          return (wv === '0' ? cf : ct)(env)
        }
      }
      case 'do':
        return compBodies(ctx, args)
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
            if (!inner.continue) return cbodies(inner)
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
          assert(enclosingLoopCtx, 'continue outside of loop')
          if (enclosingLoopCtx.ctxType === 'loop') break
          enclosingLoopCtx = enclosingLoopCtx.outer
        }
        for (const uv of updateVars) {
          if (!enclosingLoopCtx.varDescs.has(uv)) throw new Error(`loop variable ${uv} not found in loop context`)
        }
        return (env) => {
          let enclosingLoopEnv = env
          while (true) {
            assert(enclosingLoopEnv, 'continue outside of loop')
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
      case 'constant': {
        const [varName, value] = args
        const vn = wordValue(varName)
        const compValue = wunsComp(ctx, value)
        const varDesc = { defForm: firstForm }
        ctx.varDescs.set(vn, varDesc)
        return (env) => {
          const { varValues } = env
          const val = compValue(env)
          varValues.set(vn, val)
          return unit
        }
      }
      case 'func':
      case 'macro': {
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
          type: 'closure',
          name: fmname,
          params: params.map(wordValue),
          restParam,
          isMacro: firstWordValue === 'macro',
        }
        ctx.varDescs.set(n, funMacDesc)
        const newCtx = { varDescs, outer: ctx, ctxType: wordValue(firstForm) }
        funMacDesc.cbodies = compBodies(newCtx, bodies)
        Object.freeze(funMacDesc)
        return (env) => {
          const { varValues } = env
          const closure = { funMacDesc, closureEnv: env }
          varValues.set(n, closure)
          return closure
        }
      }
    }
    const funcOrMacroDesc = getCtxVar(ctx, firstWordValue)
    if (funcOrMacroDesc === undefined) throw new Error(`function ${firstWordValue} not found ${print(form)}`)
    if (funcOrMacroDesc.type === 'external-function') {
      const cargs = args.map((a) => wunsComp(ctx, a))
      return (env) => {
        const f = getVarValue(env, firstWordValue)
        if (typeof f !== 'function') throw new Error(`expected function, got ${typeof f}`)
        return jsToWuns(f(...cargs.map((carg) => carg(env))))
      }
    }
    if (funcOrMacroDesc.type !== 'closure')
      throw new Error(`unexpected function type ${typeof funcOrMacroDesc} ${funcOrMacroDesc}`)
    const { name, params, restParam, cbodies } = funcOrMacroDesc
    const arity = params.length
    let setArguments = (args) => {
      const varValues = new Map()
      for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
      return varValues
    }
    const numberOfGivenArgs = args.length
    if (restParam === null) {
      if (arity !== numberOfGivenArgs) throw new Error(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`)
    } else {
      if (arity > numberOfGivenArgs)
        throw new Error(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`)
      setArguments = (args) => {
        const varValues = setArguments(args)
        varValues.set(restParam, makeList(...args.slice(arity)))
        return varValues
      }
    }
    if (funcOrMacroDesc.isMacro)
      return (env) => {
        const { funMacDesc, closureEnv } = getVarValue(env, firstWordValue)
        assert(funMacDesc === funcOrMacroDesc, `function ${firstWordValue} not found ${print(form)}`)
        const inner = { varValues: setArguments(args), outer: closureEnv }
        return wunsComp(ctx, cbodies(inner))(env)
      }
    const cargs = args.map((a) => wunsComp(ctx, a))
    return (env) => {
      const { funMacDesc, closureEnv } = getVarValue(env, firstWordValue)
      assert(funMacDesc === funcOrMacroDesc, `function ${firstWordValue} not found ${print(form)}`)
      const inner = { varValues: setArguments(cargs.map((carg) => carg(env))), outer: closureEnv }
      return cbodies(inner)(env)
    }
  }

  const evalLogForms = (forms) => {
    try {
      for (const form of forms) {
        const cform = wunsComp(topCtx, form)
        const v = cform(topEnv)
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
  }
}
