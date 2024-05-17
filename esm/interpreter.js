import fs from 'node:fs'
import path from 'node:path'
import { makeList, word, wordValue, is_word, is_list, isUnit, unit, print, wordWithMeta, listWithMeta } from './core.js'
const __dirname = import.meta.dirname
const wasmModule = new WebAssembly.Module(fs.readFileSync(path.resolve(__dirname, '..', 'src', 'instructions.wasm')))
const wasmInstance = new WebAssembly.Instance(wasmModule)
const instructions = wasmInstance.exports

const isValidRuntimeValue = (v) => is_word(v) || (is_list(v) && v.every(isValidRuntimeValue))

const jsFunctions = await import('./core.js')

const moduleMap = new Map()
const globalVarValues = new Map()
const globalEnv = { varValues: globalVarValues, outer: null }
const apply = ({ name, params, restParam, bodies }, args) => {
  const arity = params.length
  const numberOfGivenArgs = args.length
  if (restParam === null) {
    if (arity !== numberOfGivenArgs) throw new Error(`${name} expected ${arity} arguments, got ${numberOfGivenArgs}`)
  } else {
    if (arity > numberOfGivenArgs)
      throw new Error(`${name} expected at least ${arity} arguments, got ${numberOfGivenArgs}`)
  }
  const varValues = new Map()
  for (let i = 0; i < arity; i++) varValues.set(wordValue(params[i]), args[i])
  if (restParam) varValues.set(wordValue(restParam), makeList(...args.slice(arity)))
  const inner = { varValues, outer: globalEnv }
  let result = unit
  for (const body of bodies) result = wunsEval(body, inner)
  return result
}
const assert = (cond, msg) => {
  if (!cond) throw new Error('eval assert failed: ' + msg)
}
const wunsEval = (form, env) => {
  if (is_word(form)) {
    const v = wordValue(form)
    while (true) {
      if (!env) {
        if (globalVarValues.has(v)) return globalVarValues.get(v)
        throw new Error(`undefined variable ${v}`)
      }
      const { varValues, outer } = env
      if (varValues.has(v)) return varValues.get(v)
      env = outer
    }
  }

  assert(is_list(form), `cannot eval ${form} expected word or list`)
  if (form.length === 0) return form
  const [firstForm, ...args] = form
  const firstWordValue = wordValue(firstForm)
  switch (firstWordValue) {
    case 'quote':
      return args.length === 1 ? args[0] : Object.freeze(args)
    case 'if': {
      const ifArgs = [...args, unit, unit, unit].slice(0, 3)
      const evaledCond = wunsEval(ifArgs[0], env)
      const isZeroWord = is_word(evaledCond) && wordValue(evaledCond) === 0
      return wunsEval(ifArgs[isZeroWord ? 2 : 1], env)
    }
    case 'let':
    case 'loop': {
      const [bindings, ...bodies] = args
      const varValues = new Map()
      const inner = { varValues, outer: env, loop: firstWordValue === 'loop' }
      for (let i = 0; i < bindings.length - 1; i += 2) {
        const varName = wordValue(bindings[i])
        const value = wunsEval(bindings[i + 1], inner)
        if (varName === '-') {
          if (!isUnit(value))
            console.log(`warning: discarding non-unit value ${value} for varName ${varName} in ${print(form)}`)
          continue
        }
        varValues.set(varName, value)
      }
      let result = unit
      if (firstWordValue === 'let') {
        for (const body of bodies) result = wunsEval(body, inner)
        return result
      }
      inner.continue = true
      while (inner.continue) {
        inner.continue = false
        let result = unit
        for (const body of bodies) result = wunsEval(body, inner)
        if (!inner.continue) return result
      }
    }
    case 'continue': {
      let enclosingLoopEnv = env
      while (true) {
        assert(enclosingLoopEnv, 'continue outside of loop')
        if (enclosingLoopEnv.loop) break
        enclosingLoopEnv = enclosingLoopEnv.outer
      }
      const loopVars = enclosingLoopEnv.varValues
      for (let i = 0; i < args.length; i += 2) {
        const arg = args[i]
        const v = wordValue(arg)
        assert(loopVars.has(v), 'continue with undeclared variable')
        loopVars.set(v, wunsEval(args[i + 1], env))
      }
      enclosingLoopEnv.continue = true
      return unit
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
      const fObj = { name: fmname, isMacro: firstWordValue === 'macro', params, restParam, bodies }
      globalVarValues.set(wordValue(fmname), fObj)
      return unit
    }
    case 'constant': {
      const [varName, value] = args
      globalVarValues.set(wordValue(varName), wunsEval(value, env))
      return unit
    }
    case 'wasm-import-func': {
      if (args.length !== 3) throw new Error('wasm-import expects 3 arguments')
      const [instanceArg, exportFunctionName, importName] = args
      const instance = wunsEval(instanceArg, env)
      assert(instance instanceof WebAssembly.Instance, `expected wasm instance, found ${instance}`)
      const f = instance.exports[wordValue(exportFunctionName)]
      if (typeof f !== 'function') throw new Error(`expected function, found ${f}`)
      const fObj = { wasmFunc: true, f }
      globalVarValues.set(wordValue(importName), fObj)
      return unit
    }
    case 'tuple':
      return makeList(...args.map((a) => wunsEval(a, env)))
    case 'external-func': {
      if (args.length !== 3) throw new Error('external-func expects 3 arguments')
      const [name, params, results] = args
      // funcEnv.set(wordValue(name), func)
      const funcObj = jsFunctions[wordValue(name).replace(/-/g, '_')]
      assert(funcObj, `extern function ${name} not found`)
      if (!(typeof funcObj === 'function')) throw new Error(`expected function, found ${funcObj}`)
      const parameterCount = funcObj.length
      assert(is_list(params), `extern expected list of parameters, found ${params}`)
      assert(
        params.length === parameterCount,
        `extern function ${name} expected ${parameterCount} arguments, got ${params.length}`,
      )
      for (const param of params) {
        if (!is_word(param)) throw new Error('extern expected word arguments')
      }
      globalVarValues.set(wordValue(name), funcObj)
      return unit
    }
    case 'import': {
      const [module, ...imports] = args
    }
  }
  try {
    const funcOrMacro = globalVarValues.get(firstWordValue)
    if (!funcOrMacro) {
      const instr = instructions[firstWordValue]
      if (!instr) throw new Error(`function ${firstWordValue} not found ${print(form)}`)
      const res = instr(...args.map((arg) => wunsEval(arg, env)))
      if (res === undefined) return unit
      return res
    }
    assert(funcOrMacro, `function ${firstWordValue} not found ${print(form)}`)
    if (typeof funcOrMacro === 'function') {
      const parameterCount = funcOrMacro.length
      assert(
        args.length === parameterCount,
        `${firstWordValue} expected ${parameterCount} arguments, got ${args.length}`,
      )
      const res = funcOrMacro(...args.map((arg) => wunsEval(arg, env)))
      if (res === undefined) return unit
      // if (!isValidRuntimeValue(res)) throw new Error(`expected valid runtime value, found ${res}`)
      return res
    }
    assert(typeof funcOrMacro === 'object', `expected function or object ${funcOrMacro}`)
    const { isMacro, wasmFunc } = funcOrMacro
    if (wasmFunc) {
      const res = funcOrMacro.f(...args.map((arg) => wunsEval(arg, env)))
      if (typeof res === 'undefined') return unit
      if (!isValidRuntimeValue(res)) throw new Error(`expected valid runtime value, found ${res}`)
    }
    if (isMacro) return wunsEval(apply(funcOrMacro, args), env)
    return apply(
      funcOrMacro,
      args.map((arg) => wunsEval(arg, env)),
    )
  } catch (e) {
    console.error('error evaluating', firstWordValue)
    throw e
  }
}

const gogoeval = (form) => wunsEval(form, globalEnv)

const nodeToOurForm = (node) => {
  const { type, text, namedChildren, startPosition, endPosition } = node
  const range = makeList(...[startPosition.row, startPosition.column, endPosition.row, endPosition.column])
  const metaData = makeList(word('range'), range, word('node-id'), node.id)
  switch (type) {
    case 'word':
      return wordWithMeta(text, metaData)
    case 'list':
      return listWithMeta(namedChildren.map(nodeToOurForm), metaData)
    default:
      throw new Error('unexpected node type: ' + type)
  }
}

import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)

export const evalString = (content) => {
  const tree = parser.parse(content)
  for (const node of tree.rootNode.children) {
    const form = nodeToOurForm(node)
    try {
      console.log(print(gogoeval(form)))
    } catch (e) {
      console.error('error evaluating', print(form), e)
      throw e
    }
  }
}

export const evalFile = (filePath) => {
  evalString(fs.readFileSync(filePath, 'utf8'))
}
