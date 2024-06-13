import fs from 'fs'

import { makeList, wordValue, isWord, isList, isUnit, unit, print, unword, isSigned32BitInteger, meta } from './core.js'
import { parseStringToForms } from './parseTreeSitter.js'
import { i32binops } from './instructions.js'

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
if ((a | 0) !== a) throw new Error('op ${op} expected 32-bit signed integer, found: ' + a + ' ${op} ' + b)
if ((b | 0) !== b) throw new Error('op ${op} expected 32-bit signed integer, found: ' + a + ' ${op} ' + b)
return (a ${op} b) | 0`,
  )
}
instructions['unreachable'] = () => {
  throw new Error('unreachable')
}

const hostExports = Object.entries(await import('./host.js')).map(([name, f]) => [name.replace(/_/g, '-'), f])

export const makeContext = (options) => {
  let { wunsDir, contextName, importObject } = options
  importObject = importObject || {}
  if ('host' in importObject) throw new Error('importObject cannot contain host')
  const files = new Map()
  for (const file of fs.readdirSync(wunsDir)) {
    if (!file.endsWith('.wuns')) continue
    files.set(file, fs.readFileSync(wunsDir + file, 'ascii'))
  }
  const prefix = contextName + ':'
  const hostFuncs = {
    // todo define in host.js
    'make-interpreter-context': (contextName) => makeContext({ ...options, contextName }),
    log: (form) => {
      console.log(prefix, print(form))
    },
  }
  for (const [name, f] of hostExports) hostFuncs[name] = f
  const externals = { host: hostFuncs, ...importObject }

  let currentFilename = null
  const modules = new Map()
  const currentModuleEnv = () => {
    let modEnv = modules.get(currentFilename)
    if (modEnv) return modEnv
    modEnv = { varValues: new Map(), exports: new Set() }
    modules.set(currentFilename, modEnv)
    return modEnv
  }
  const currentModuleVars = () => {
    return currentModuleEnv().varValues
  }
  const moduleVarSet = (name, value) => {
    const moduleVars = currentModuleVars()
    moduleVars.set(name, value)
  }
  const getFile = (filename) => {
    if (files.has(filename)) return files.get(filename)
    throw new Error('file not found: ' + filename)
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
      const { cbodies } = funcOrMacro
      assert(cbodies, `no cbodies in: ${name}`)
      const inner = { varValues: setArguments(args), outer: moduleEnv }
      let result = unit
      for (const cbody of cbodies) result = cbody(inner)
      return result
    }
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
        const unworded = unword(res)
        return () => unworded
      }
      case 'if': {
        const ifArgs = [...args, unit, unit, unit].slice(0, 3)
        let [cc, ct, cf] = ifArgs.map(wunsComp)
        return (env) => (cc(env) === 0 ? cf : ct)(env)
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
      case 'tuple': {
        const cargs = args.map(wunsComp)
        return (env) => makeList(...cargs.map((carg) => carg(env)))
      }
      case 'i32': {
        const n = wordValue(args[0])
        if (!isSigned32BitInteger(n)) throw new Error(`expected 32-bit signed integer, found ${n}`)
        return () => n
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
      case 'external': {
        assert(args.length === 3, `external-func expects 3 arguments, found ${args.length}`)
        const [moduleName, name, type] = args
        const module = externals[wordValue(moduleName)]
        assert(module, `external module ${moduleName} not found`)
        const n = wordValue(name)
        const externalObj = module[n]
        assert(externalObj, `external ${name} not found`)
        assert(isList(type), `expected external spec, found ${type}`)
        assert(type.length > 0, `external expected non-empty list of parameters, found ${type}`)
        if (wordValue(type[0]) === 'func') {
          assert(typeof externalObj === 'function', `external expected function, found ${externalObj}`)
          assert(type.length === 3, `external expected 3 arguments, found ${type}`)
          const params = type[1]
          assert(isList(params), `external expected list of parameters, found ${params}`)
          // for (const param of params) assert(isWord(param), `external expected word, found ${param}`)
          const actualParameterCount = externalObj.length
          assert(
            params.length === actualParameterCount,
            `external function ${name} expected ${actualParameterCount} parameters, got ${params.length}`,
          )
          moduleVarSet(n, externalObj)
        }
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
        const { varValues, exports } = currentModuleEnv()
        for (const name of args) {
          if (!isWord(name)) throw new Error(`export expects word, found ${name}`)
          const s = wordValue(name)
          if (!varValues.has(s)) throw new Error(`export failed: ${s} not found in ${currentFilename}`)
          exports.add(s)
        }
        return null
      }
    }
    try {
      const inst = instructions[firstWordValue]
      if (inst) {
        if (typeof inst === 'function') {
          const parameterCount = inst.length
          assert(args.length === parameterCount, `expected ${parameterCount} arguments, got ${args.length}`)
          const cargs = args.map(wunsComp)
          return (env) => inst(...cargs.map((carg) => carg(env)))
        } else if (typeof inst === 'object') {
          const { immediateParams, regularParams, func } = inst
          const arity = immediateParams + regularParams
          assert(args.length === arity, `${firstWordValue} expected ${arity} arguments, got ${args.length}`)
          const immediateArgs = args.slice(0, immediateParams)
          for (const arg of immediateArgs) assert(isSigned32BitInteger(arg), `expected word, found ${arg}`)
          const cargs = args.slice(immediateParams).map(wunsComp)
          const immediateValues = immediateArgs.map((arg) => wordValue(arg))
          return (env) => {
            const regularValues = cargs.map((carg) => carg(env))
            return func(...immediateValues, ...regularValues)
          }
        }
      }
      const funcOrMacro = currentModuleVars().get(firstWordValue)
      if (funcOrMacro === undefined)
        throw new Error(`function ${firstWordValue} not found ${print(form)} in ${currentFilename}`)
      if (typeof funcOrMacro === 'function') {
        const parameterCount = funcOrMacro.length
        assert(
          args.length === parameterCount,
          `${firstWordValue} expected ${parameterCount} arguments, got ${args.length}`,
        )
        const cargs = args.map(wunsComp)
        return (env) => {
          try {
            const res = funcOrMacro(...cargs.map((carg) => carg(env)))
            if (res === undefined) return unit
            // if (!isValidRuntimeValue(res)) throw new Error(`expected valid runtime value, found ${res}`)
            return res
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
  const macroExpand = (form) => {
    if (isWord(form)) return form
    if (!isList(form)) return form
    if (form.length === 0) return form
    const [first, ...args] = form
    if (!isWord(first)) return form
    const firstWordValue = wordValue(first)
    switch (firstWordValue) {
      case 'if':
        return makeList(first, ...args.map(macroExpand))
      case 'let':
      case 'loop': {
        let [bindings, ...bodies] = args
        let expandedBindings = []
        for (let i = 0; i < bindings.length - 1; i += 2)
          expandedBindings.push(bindings[i], macroExpand(bindings[i + 1]))
        let expandedBodies = bodies.map(macroExpand)
        return makeList(first, makeList(...expandedBindings), ...expandedBodies)
      }
      case 'continue': {
        let expandedBindings = []
        for (let i = 1; i < form.length; i += 2) expandedBindings.push(form[i], macroExpand(form[i + 1]))
        return makeList(first, ...expandedBindings)
      }
      case 'func':
      case 'macro': {
        let [name, params, ...bodies] = args
        return makeList(first, name, params, ...bodies.map(macroExpand))
      }
      case 'quote':
      case 'i32':
        return form

      case 'constant': {
        const [varName, value] = args
        return makeList(first, varName, macroExpand(value))
      }
      case 'external-func':
      case 'import':
      case 'export':
        throw new Error(`cannot macro-expand ${firstWordValue}`)
    }
    const inst = instructions[firstWordValue]
    if (inst) return makeList(first, ...args.map(macroExpand))
    const funcOrMacro = currentModuleVars().get(firstWordValue)
    if (funcOrMacro === undefined) return makeList(first, ...args.map(macroExpand))
    if (typeof funcOrMacro === 'function') return makeList(first, ...args.map(macroExpand))
    if (typeof funcOrMacro !== 'object') throw new Error(`expected function or object ${funcOrMacro}`)
    const { isMacro } = funcOrMacro
    if (!isMacro) return makeList(first, ...args.map(macroExpand))
    const internalApply = seqApply(funcOrMacro, args.length)
    const r = internalApply(args)
    return macroExpand(r)
  }
  const getExported = (moduleName, exportedName) => {
    const modEnv = modules.get(moduleName)
    if (!modEnv) throw new Error(`module ${moduleName} not found`)
    const { exports, varValues } = modEnv
    if (!exports.has(exportedName)) throw new Error(`export ${exportedName} not found in ${moduleName}`)
    return varValues.get(exportedName)
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
    currentFilename = filename
    const content = getFile(filename)
    parseEvalString(content)
  }
  return {
    getExported,
    apply,
    evalLogForms,
    evalFormCurrentModule,
    macroExpandCurrentModule: macroExpand,
    parseEvalString,
    parseEvalFile,
    getCurrentFilename: () => currentFilename,
  }
}
