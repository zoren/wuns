import fs from 'fs'

import {
  makeList,
  wordValue,
  isWord,
  isList,
  isForm,
  isUnit,
  unit,
  print,
  isSigned32BitInteger,
  meta,
  word,
  is_atom
} from './core.js'
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
  throw new Error(`cannot convert ${js} of type ${typeof js} to wuns ${js.constructor.name}`)
}

const seqApply = (funcOrMacro, numberOfGivenArgs) => {
  const { name, params, restParam, moduleEnv } = funcOrMacro
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
  return (args) => {
    assert(args.length === numberOfGivenArgs, `expected ${numberOfGivenArgs} arguments, got ${args.length}`)
    const { cbodies } = funcOrMacro
    assert(cbodies, `no cbodies in: ${name}`)
    const inner = { varValues: setArguments(args), outer: moduleEnv }
    let result = unit
    for (const cbody of cbodies) result = cbody(inner)
    return result
  }
}

const instructions = []
for (const [name, op] of Object.entries(i32binops)) {
  const opfn = Function('a', 'b', `return (a ${op} b) | 0`)
  const f = (a, b) => {
    const numberArgs = [a, b].map((arg) => {
      const wv = wordValue(arg)
      const n = Number(wv)
      if (!isSigned32BitInteger(n)) throw new Error(`expected 32-bit signed integer, found: ${wv}`)
      return n
    })
    return opfn(...numberArgs)
  }
  instructions.push([name, f])
}

const hostExports = Object.entries(await import('./host.js')).map(([name, f]) => [name.replace(/_/g, '-'), f])

export const makeContext = () => {
  const topVarValues = new Map()
  const moduleVarSet = (name, value) => {
    if (topVarValues.has(name)) throw new Error(`duplicate variable ${name}`)
    topVarValues.set(name, value)
  }
  for (const [name, f] of instructions) moduleVarSet(name, f)
  for (const [name, f] of hostExports) moduleVarSet(name, f)
  const topEnv = { varValues: topVarValues, outer: null }
  const currentModuleEnv = () => topEnv
  const wunsComp = (form) => {
    const compBodies = (bodies) => {
      const cbodies = []
      for (const body of bodies) {
        const cbody = wunsComp(body)
        if (cbody === null) continue
        cbodies.push(cbody)
      }
      return makeList(...cbodies)
    }
    if (isWord(form)) {
      const v = wordValue(form)
      return (env) => {
        const startEnv = env
        while (true) {
          if (!env) {
            console.dir({ form, v, t: typeof v, startEnv }, { depth: null })
            throw new Error(`undefined variable ${v}`)
          }
          const { varValues, outer } = env
          if (varValues.has(v)) return varValues.get(v)
          env = outer
        }
      }
    }
    assert(isList(form), `cannot eval ${form} expected word or list`)
    if (form.length === 0) return () => unit
    const [firstForm, ...args] = form
    const firstWordValue = wordValue(firstForm)
    switch (firstWordValue) {
      case 'quote': {
        const res = args.length === 1 ? args[0] : args
        return () => res
      }
      case 'if': {
        const ifArgs = [...args, unit, unit, unit].slice(0, 3)
        let [cc, ct, cf] = ifArgs.map(wunsComp)
        return (env) => {
          const cv = cc(env)
          const wv = wordValue(cv)
          return (wv === '0' ? cf : ct)(env)
        }
      }
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const compBindings = []
        for (let i = 0; i < bindings.length - 1; i += 2)
          compBindings.push([wordValue(bindings[i]), wunsComp(bindings[i + 1])])
        const cbodies = compBodies(bodies)
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
        const updateNames = []
        const compExps = []
        for (let i = 0; i < args.length; i += 2) {
          updateNames.push(wordValue(args[i]))
          compExps.push(wunsComp(args[i + 1]))
        }
        return (env) => {
          let enclosingLoopEnv = env
          while (true) {
            assert(enclosingLoopEnv, 'continue outside of loop')
            if (enclosingLoopEnv.loop) break
            enclosingLoopEnv = enclosingLoopEnv.outer
          }
          const newValues = compExps.map((compVal) => compVal(env))
          const { varValues } = enclosingLoopEnv
          for (let i = 0; i < updateNames.length; i++) {
            const varName = updateNames[i]
            if (!varValues.has(varName)) throw new Error(`undefined loop variable ${varName}`)
            varValues.set(varName, newValues[i])
          }
          enclosingLoopEnv.continue = true
          return unit
        }
      }
      // side effect forms
      case 'func':
      case 'macro': {
        const [fmname, origParams0, ...bodies] = args
        const origParams = origParams0 || unit
        let params = origParams
        let restParam = null
        if (origParams.length > 1 && wordValue(origParams.at(-2)) === '..') {
          params = origParams.slice(0, -2)
          restParam = wordValue(origParams.at(-1))
        }
        const fObj = {
          name: fmname,
          isMacro: firstWordValue === 'macro',
          params: params.map(wordValue),
          restParam,
          moduleEnv: currentModuleEnv(),
        }
        const n = wordValue(fmname)
        moduleVarSet(n, fObj)
        const cbodies = compBodies(bodies)
        fObj.cbodies = cbodies
        return null
      }
      case 'constant': {
        const [varName, value] = args
        const vn = wordValue(varName)
        const compValue = wunsComp(value)
        moduleVarSet(vn, compValue(currentModuleEnv()))
        return null
      }
    }
    try {
      const funcOrMacro = topVarValues.get(firstWordValue)
      if (funcOrMacro === undefined) throw new Error(`function ${firstWordValue} not found ${print(form)}`)
      if (typeof funcOrMacro === 'function') {
        const parameterCount = funcOrMacro.length
        assert(
          args.length === parameterCount,
          `${firstWordValue} expected ${parameterCount} arguments, got ${args.length}`,
        )
        const cargs = args.map(wunsComp)
        return (env) => {
          try {
            return jsToWuns(funcOrMacro(...cargs.map((carg) => carg(env))))
          } catch (e) {
            console.error('error evaluating', firstWordValue, print(form), meta(form))
            throw e
          }
        }
      }
      assert(typeof funcOrMacro === 'object', `expected function or object ${funcOrMacro}`)
      const { isMacro } = funcOrMacro
      const internalApply = seqApply(funcOrMacro, args.length)
      if (isMacro) return wunsComp(internalApply(args))

      const cargs = args.map(wunsComp)
      return (env) => {
        try {
          return internalApply(cargs.map((carg) => carg(env)))
        } catch (e) {
          console.error('error evaluating', firstWordValue, print(form), meta(form))
          throw e
        }
      }
    } catch (e) {
      console.error('error evaluating', firstWordValue)
      throw e
    }
  }

  const apply = (funcOrMacro, args) => {
    const { isMacro } = funcOrMacro
    const internalApply = seqApply(funcOrMacro, args.length)
    if (isMacro) return wunsComp(internalApply(args))
    return internalApply(args)
  }

  const compEval = (form, moduleEnv) => {
    const cform = wunsComp(form)
    return cform === null ? unit : cform(moduleEnv)
  }

  const evalLogForms = (forms) => {
    try {
      const moduleEnv = currentModuleEnv()
      for (const form of forms) {
        const v = compEval(form, moduleEnv)
        if (!isUnit(v)) console.log(print(v))
      }
    } catch (e) {
      console.error('error evaluating', e)
    }
  }

  const evalFormCurrentModule = (form) => compEval(form, currentModuleEnv())

  const parseEvalString = (content) => {
    evalLogForms(parseStringToForms(content))
  }

  const parseEvalFile = (filename) => {
    parseEvalString(fs.readFileSync(filename, 'ascii'))
  }
  return {
    apply,
    evalLogForms,
    evalFormCurrentModule,
    parseEvalString,
    parseEvalFile,
  }
}
