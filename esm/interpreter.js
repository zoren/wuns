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

const seqApply = (funcOrMacroDesc, numberOfGivenArgs) => {
  const { name, params, restParam, cbodies } = funcOrMacroDesc
  const arity = params.length
  let setArguments
  if (restParam === null) {
    if (arity !== numberOfGivenArgs) throw new Error(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`)
    setArguments = (args) => {
      const varValues = new Map()
      for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
      return varValues
    }
  } else {
    if (arity > numberOfGivenArgs)
      throw new Error(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`)
    setArguments = (args) => {
      const varValues = new Map()
      for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
      varValues.set(restParam, makeList(...args.slice(arity)))
      return varValues
    }
  }
  return (closureEnv, args) => {
    assert(args.length === numberOfGivenArgs, `expected ${numberOfGivenArgs} arguments, got ${args.length}`)
    const inner = { varValues: setArguments(args), outer: closureEnv }
    let result = unit
    for (const cbody of cbodies) result = cbody(inner)
    return result
  }
}

const getVarValue = (env, v) => {
  while (true) {
    if (!env) throw new Error(`undefined variable ${v}`)
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
    return cbodies
  }
  const wunsComp = (ctx, form) => {
    if (isWord(form)) {
      const v = wordValue(form)
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
      case 'do': {
        const cbodies = compBodies(ctx, args)
        return (env) => {
          let result = unit
          for (const cbody of cbodies) result = cbody(env)
          return result
        }
      }
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const compBindings = []
        const varDescs = new Map()
        const newCtx = { varDescs, outer: ctx }
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
            let result = unit
            for (const cbody of cbodies) result = cbody(inner)
            return result
          }

        return (env) => {
          const varValues = new Map()
          const inner = { varValues, outer: env, loop: true, continue: true }
          for (const [varName, compVal] of compBindings) varValues.set(varName, compVal(inner))
          while (inner.continue) {
            inner.continue = false
            let result = unit
            for (const cbody of cbodies) result = cbody(inner)
            if (!inner.continue) return result
          }
        }
      }
      case 'continue': {
        const updateBindings = []
        for (let i = 0; i < args.length; i += 2) updateBindings.push([wordValue(args[i]), wunsComp(ctx, args[i + 1])])
        return (env) => {
          let enclosingLoopEnv = env
          while (true) {
            assert(enclosingLoopEnv, 'continue outside of loop')
            if (enclosingLoopEnv.loop) break
            enclosingLoopEnv = enclosingLoopEnv.outer
          }
          const { varValues } = enclosingLoopEnv
          for (const [varName, compVal] of updateBindings) {
            if (!varValues.has(varName)) throw new Error(`undefined loop variable ${varName}`)
            varValues.set(varName, compVal(env))
          }
          enclosingLoopEnv.continue = true
          return unit
        }
      }
      case 'constant': {
        const [varName, value] = args
        const vn = wordValue(varName)
        const compValue = wunsComp(ctx, value)
        const varDesc = { defForm: firstForm }
        return (env) => {
          const { varValues } = env
          const val = compValue(env)
          ctx.varDescs.set(vn, val.funMacDesc ?? varDesc)
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
        const varDescs = new Map()
        if (origParams.length > 1 && wordValue(origParams.at(-2)) === '..') {
          params = origParams.slice(0, -2)
          restParam = wordValue(origParams.at(-1))
          const desc = { defForm: firstForm }
          for (const p of params) varDescs.set(wordValue(p), desc)
          varDescs.set(restParam, desc)
        }
        const funMacDesc = {
          type: 'closure',
          name: fmname,
          isMacro: firstWordValue === 'macro',
          params: params.map(wordValue),
          restParam,
        }
        ctx.varDescs.set(n, funMacDesc)
        funMacDesc.cbodies = compBodies({ varDescs, outer: ctx }, bodies)
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
    if (funcOrMacroDesc.type === 'closure') {
      const internalApply = seqApply(funcOrMacroDesc, args.length)
      if (funcOrMacroDesc.isMacro)
        return (env) => {
          const { funMacDesc, closureEnv } = getVarValue(env, firstWordValue)
          assert(funMacDesc === funcOrMacroDesc, `function ${firstWordValue} not found ${print(form)}`)
          return wunsComp(ctx, internalApply(closureEnv, args))(env)
        }

      const cargs = args.map((a) => wunsComp(ctx, a))
      return (env) => {
        const { funMacDesc, closureEnv } = getVarValue(env, firstWordValue)
        assert(funMacDesc === funcOrMacroDesc, `function ${firstWordValue} not found ${print(form)}`)
        return internalApply(
          closureEnv,
          cargs.map((carg) => carg(env)),
        )
      }
    }
    if (funcOrMacroDesc.type === 'external-function') {
      const cargs = args.map((a) => wunsComp(ctx, a))
      return (env) => {
        const f = getVarValue(env, firstWordValue)
        if (typeof f !== 'function') {
          console.dir(f)
          console.dir(firstWordValue)
          throw new Error(`expected function, got ${typeof f}`)
        }
        return jsToWuns(f(...cargs.map((carg) => carg(env))))
      }
    }
    throw new Error(`unexpected function type ${typeof funcOrMacroDesc}`)
  }

  const evalLogForms = (forms) => {
    try {
      const moduleEnv = topEnv
      for (const form of forms) {
        const cform = wunsComp(topCtx, form)
        const v = cform(moduleEnv)
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
