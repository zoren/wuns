import { makeList, wordValue, isWord, isList, isUnit, unit, print, unword } from './core.js'
import { parseStringToForms } from './parseByHand.js'
import { i32binops } from './instructions.js'

const files = new Map()
export const getFile = (filename) => {
  if (files.has(filename)) return files.get(filename)
  console.log(files)
  console.log([...files.keys()])
  throw new Error('file not found: ' + filename)
}
export const setFile = (filename, fileContent) => {
  if (typeof filename !== 'string') throw new Error('expected string')
  if (typeof fileContent !== 'string') throw new Error('expected string')
  files.set(filename, fileContent)
}

const isValidRuntimeValue = (v) => isWord(v) || (isList(v) && v.every(isValidRuntimeValue))
const assert = (cond, msg) => {
  if (!cond) throw new Error('eval assert failed: ' + msg)
}
const instructions = {}
for (const [name, op] of Object.entries(i32binops)) {
  instructions[name] = Function(
    'a',
    'b',
    `
if ((a | 0) !== a) throw new Error('op ${op} expected 32-bit signed integer, found: ' + a)
if ((b | 0) !== b) throw new Error('op ${op} expected 32-bit signed integer, found: ' + b)
return (a ${op} b) | 0`,
  )
}

const hostExports = Object.entries(await import('./host.js'))

const externalFunctions = {}
for (const [name, f] of hostExports) externalFunctions[name.replace(/_/g, '-')] = f

export const defineImportFunction = (name, f) => {
  // if (name in importFunctions) throw new Error(`function ${name} already defined`)
  externalFunctions[name] = f
}

export let currentFilename = null

const modules = new Map()
const currentModuleEnv = () => {
  let modEnv = modules.get(currentFilename)
  if (modEnv) return modEnv
  modEnv = { varValues: new Map() }
  modules.set(currentFilename, modEnv)
  return modEnv
}
const currentModuleVars = () => {
  return currentModuleEnv().varValues
}

export const moduleVarGet = (name) => {
  const moduleVars = currentModuleVars()
  if (moduleVars.has(name)) return moduleVars.get(name)
  throw new Error(`global ${name} not found in ${currentFilename}`)
}

const moduleVarSet = (name, value) => {
  const moduleVars = currentModuleVars()
  if (moduleVars.has(name)) throw new Error('global variable already defined: ' + name)
  moduleVars.set(name, value)
}

const checkApplyArity = ({ name, params, restParam }, numberOfGivenArgs) => {
  const arity = params.length
  if (restParam === null) {
    if (arity !== numberOfGivenArgs) throw new Error(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`)
  } else {
    if (arity > numberOfGivenArgs)
      throw new Error(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`)
  }
}

const internalApply = (fobj, args) => {
  const { name, params, restParam, cbodies, moduleEnv } = fobj
  if (!cbodies) {
    console.log(fobj)
    throw new Error('no cbodies in:' + name)
  }
  const arity = params.length
  const varValues = new Map()
  for (let i = 0; i < arity; i++) varValues.set(params[i], args[i])
  if (restParam) varValues.set(restParam, makeList(...args.slice(arity)))
  const inner = { varValues, outer: moduleEnv }
  let result = unit
  for (const cbody of cbodies) result = cbody(inner)
  return result
}
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
      while (true) {
        if (!env) throw new Error(`undefined variable ${v}`)
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
      const unworded = unword(res)
      return () => unworded
    }
    case 'if': {
      const ifArgs = [...args, unit, unit, unit].slice(0, 3)
      let [cc, ct, cf] = ifArgs.map(wunsComp)
      return (env) => (cc(env) === 0 ? cf(env) : ct(env))
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
        const varName = wordValue(args[i])
        updateNames.push(varName)
        const compVal = wunsComp(args[i + 1])
        compExps.push(compVal)
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
    case 'list': {
      const cargs = args.map(wunsComp)
      return (env) => makeList(...cargs.map((carg) => carg(env)))
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
    case 'external-func': {
      if (args.length !== 3) throw new Error('external-func expects 3 arguments')
      const [name, params, results] = args
      const n = wordValue(name)
      const funcObj = externalFunctions[n]
      assert(funcObj, `external-func function ${name} not found`)
      assert(typeof funcObj === 'function', `external-func expected function, found ${funcObj}`)
      assert(isList(params), `external-func expected list of parameters, found ${params}`)
      for (const param of params) assert(isWord(param), `external-func expected word, found ${param}`)
      const actualParameterCount = funcObj.length
      assert(
        params.length === actualParameterCount,
        `extern function ${name} expected ${actualParameterCount} arguments, got ${params.length}`,
      )
      moduleVarSet(n, funcObj)
      return null
    }
    case 'import': {
      const [module, ...names] = args
      const importPath = wordValue(module)
      const content = getFile(importPath)
      const forms = parseStringToForms(content)
      const prevFilename = currentFilename
      currentFilename = importPath
      const importEnv = currentModuleEnv()
      try {
        for (const form of forms) {
          const cform = wunsComp(form)
          const v = cform === null ? unit : cform(importEnv)
          if (!isUnit(v)) console.log(print(v))
        }
      } catch (e) {
        console.error('error evaluating', e)
      }
      currentFilename = prevFilename
      const importVars = importEnv.varValues
      for (const name of names) {
        const n = wordValue(name)
        const v = importVars.get(n)
        if (v === undefined) throw new Error(`import failed: ${n}`)
        moduleVarSet(n, v)
      }
      return null
    }
    case 'export': {
      const names = args

      return null
    }
  }
  try {
    const inst = instructions[firstWordValue]
    if (inst) {
      const cargs = args.map(wunsComp)
      assert(cargs.length === 2, `expected 2 arguments, got ${cargs.length}`)
      return (env) => inst(...cargs.map((carg) => carg(env)))
    }
    const funcOrMacro = currentModuleVars().get(firstWordValue)
    if (funcOrMacro === undefined) {
      throw new Error(`function ${firstWordValue} not found ${print(form)}`)
    }
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
          // should we unword here?
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
  return internalApply(funmacObj, args)
}

export const evalLogForms = (forms) => {
  try {
    const moduleEnv = currentModuleEnv()
    for (const form of forms) {
      const cform = wunsComp(form)
      const v = cform === null ? unit : cform(moduleEnv)
      if (!isUnit(v)) console.log(print(v))
    }
  } catch (e) {
    console.error('error evaluating', e)
  }
}

export const parseEvalString = (content) => {
  evalLogForms(parseStringToForms(content))
}

export const parseEvalFile = (filename) => {
  currentFilename = filename
  const content = getFile(filename)
  parseEvalString(content)
}
