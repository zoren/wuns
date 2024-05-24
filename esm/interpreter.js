import fs from 'node:fs'
import path from 'node:path'
import { makeList, wordValue, isWord, isList, isUnit, unit, print } from './core.js'
import { parseStringToForms } from './parse.js'
import { i32 } from './instructions.js'

const isValidRuntimeValue = (v) => isWord(v) || (isList(v) && v.every(isValidRuntimeValue))

const coreJsFunctions = await import('./core.js')
const importFunctions = {}
for (const [name, f] of Object.entries(coreJsFunctions)) {
  importFunctions[name.replace(/_/g, '-')] = f
}

const globalVarValues = new Map()
const globalVarSet = (name, value) => {
  if (globalVarValues.has(name)) throw new Error('global variable already defined: ' + name)
  globalVarValues.set(name, value)
}
for (const [name, f] of Object.entries(i32)) globalVarSet(name, f)

const globalEnv = { varValues: globalVarValues, outer: null }
const assert = (cond, msg) => {
  if (!cond) throw new Error('eval assert failed: ' + msg)
}

let currentFilename = null

const checkApplyArity = ({ name, params, restParam }, numberOfGivenArgs) => {
  const arity = params.length
  if (restParam === null) {
    if (arity !== numberOfGivenArgs) throw new Error(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`)
  } else {
    if (arity > numberOfGivenArgs)
      throw new Error(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`)
  }
}

const internalApply = ({ name, params, restParam, cbodies }, args) => {
  const arity = params.length
  const varValues = new Map()
  for (let i = 0; i < arity; i++) varValues.set(wordValue(params[i]), args[i])
  if (restParam) varValues.set(wordValue(restParam), makeList(...args.slice(arity)))
  const inner = { varValues, outer: globalEnv }
  let result = unit
  if (!cbodies) throw new Error('no cbodies ' + name)
  for (const cbody of cbodies) result = cbody(inner)
  return result
}
const unword = (v) => {
  if (isWord(v)) return wordValue(v)
  if (isList(v)) return makeList(...v.map(unword))
  throw new Error('quote expects word or list')
}
const wunsComp = (form) => {
  if (isWord(form)) {
    const v = wordValue(form)
    return (env) => {
      while (true) {
        if (!env) throw new Error(`undefined variable ${v}`)
        const { varValues, outer } = env
        if (varValues.has(v)) return varValues.get(v)
        env = outer
      }
    }
  }
  assert(isList(form), `cannot eval ${form} expected word or list`)
  if (form.length === 0) return () => form
  const [firstForm, ...args] = form
  const firstWordValue = wordValue(firstForm)
  switch (firstWordValue) {
    case 'quote': {
      const res = args.length === 1 ? args[0] : args
      const unworded = unword(res)
      return () => unworded
    }
    case 'if': {
      const ifArgs = [...args, unit, unit, unit].slice(0, 3)
      const [cc, ct, cf] = ifArgs.map(wunsComp)
      return (env) => {
        const evaledCond = cc(env)
        const isZeroWord = evaledCond === 0 || (isWord(evaledCond) && wordValue(evaledCond) === 0)
        return isZeroWord ? cf(env) : ct(env)
      }
    }
    case 'let':
    case 'loop': {
      const [bindings, ...bodies] = args
      const compBindings = []
      for (let i = 0; i < bindings.length - 1; i += 2) {
        const varName = wordValue(bindings[i])
        const compVal = wunsComp(bindings[i + 1])
        compBindings.push([varName, compVal])
      }
      const cbodies = bodies.map(wunsComp)
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
      const compBindings = []
      for (let i = 0; i < args.length; i += 2) {
        const varName = wordValue(args[i])
        const compVal = wunsComp(args[i + 1])
        compBindings.push([varName, compVal])
      }
      return (env) => {
        let enclosingLoopEnv = env
        while (true) {
          assert(enclosingLoopEnv, 'continue outside of loop')
          if (enclosingLoopEnv.loop) break
          enclosingLoopEnv = enclosingLoopEnv.outer
        }
        const { varValues } = enclosingLoopEnv
        for (const [varName, compVal] of compBindings) {
          if (!varValues.has(varName)) throw new Error('continue with undeclared variable')
          varValues.set(varName, compVal(env))
        }
        enclosingLoopEnv.continue = true
        return unit
      }
    }
    case 'func':
    case 'macro': {
      const [fmname, origParams0, ...bodies] = args
      const origParams = origParams0 || unit
      let params = origParams
      let restParam = null
      if (origParams.length > 1 && wordValue(origParams.at(-2)) === '..') {
        params = origParams.slice(0, -2)
        restParam = origParams.at(-1)
      }
      const fObj = { name: fmname, isMacro: firstWordValue === 'macro', params, restParam }
      const n = wordValue(fmname)

      globalVarSet(n, fObj)
      const cbodies = Object.freeze(bodies.map(wunsComp))
      fObj.cbodies = cbodies
      return () => unit
    }
    case 'constant': {
      const [varName, value] = args
      const vn = wordValue(varName)
      const compValue = wunsComp(value)
      globalVarSet(vn, compValue(globalEnv))
      return () => unit
    }
    case 'external-func': {
      if (args.length !== 3) throw new Error('external-func expects 3 arguments')
      const [name, params, results] = args
      const n = wordValue(name)
      const funcObj = importFunctions[n]
      assert(funcObj, `extern function ${name} not found`)
      if (!(typeof funcObj === 'function')) throw new Error(`expected function, found ${funcObj}`)
      const parameterCount = funcObj.length
      assert(isList(params), `extern expected list of parameters, found ${params}`)
      assert(
        params.length === parameterCount,
        `extern function ${name} expected ${parameterCount} arguments, got ${params.length}`,
      )
      for (const param of params) if (!isWord(param)) throw new Error('extern expected word arguments')
      globalVarSet(n, funcObj)
      return () => unit
    }
    case 'import': {
      const [module] = args
      const importPath = path.resolve(currentFilename, '..', wordValue(module))
      parseEvalFile(importPath)
      return () => unit
    }
  }
  try {
    const funcOrMacro = globalVarValues.get(firstWordValue)
    assert(funcOrMacro, `function ${firstWordValue} not found ${print(form)}`)
    if (typeof funcOrMacro === 'function') {
      const parameterCount = funcOrMacro.length
      assert(
        args.length === parameterCount,
        `${firstWordValue} expected ${parameterCount} arguments, got ${args.length}`,
      )
      const cargs = args.map(wunsComp)
      return (env) => {
        const res = funcOrMacro(...cargs.map((carg) => carg(env)))
        if (res === undefined) return unit
        // if (!isValidRuntimeValue(res)) throw new Error(`expected valid runtime value, found ${res}`)
        return res
      }
    }
    assert(typeof funcOrMacro === 'object', `expected function or object ${funcOrMacro}`)
    const { isMacro, wasmFunc } = funcOrMacro
    if (wasmFunc) throw new Error('wasm functions not supported in wunsComp')
    checkApplyArity(funcOrMacro, args.length)
    if (isMacro) {
      const res = internalApply(
        funcOrMacro,
        args.map((a) => {
          if (isWord(a)) return wordValue(a)
          return a
        }),
      )
      return wunsComp(res)
    }
    const cargs = args.map(wunsComp)
    return (env) =>
      internalApply(
        funcOrMacro,
        cargs.map((carg) => carg(env)),
      )
  } catch (e) {
    console.error('error evaluating', firstWordValue)
    throw e
  }
}

export const apply = (funmacObj, args) => {
  checkApplyArity(funmacObj, args.length)
  internalApply(funmacObj, args)
}

export const defineImportFunction = (name, f) => {
  // if (name in importFunctions) throw new Error(`function ${name} already defined`)
  importFunctions[name] = f
}
export const getGlobal = (name) => {
  if (globalVarValues.has(name)) return globalVarValues.get(name)
  throw new Error(`global ${name} not found`)
}

export const evalLogForms = (forms, filename) => {
  const prevFilename = currentFilename
  currentFilename = filename
  for (const form of forms) {
    try {
      const v = evalWuns(form)
      if (!isUnit(v)) console.log(print(v))
    } catch (e) {
      console.error('error evaluating', print(form), e)
    }
  }
  currentFilename = prevFilename
}

export const parseEvalFile = (filename) => {
  const content = fs.readFileSync(filename, 'utf8')
  evalLogForms(parseStringToForms(content), filename)
}

export const evalWuns = (form) => wunsComp(form)(globalEnv)
