import fs from 'fs'
import {
  makeList,
  word,
  wordValue,
  isWord,
  is_word,
  is_list,
  isUnit,
  unit,
  print,
  wordWithMeta,
  listWithMeta,
  isSigned32BitInteger,
} from './core.js'

import TSParser from 'tree-sitter'
const parser = new TSParser()

import Wuns from 'tree-sitter-wuns'
parser.setLanguage(Wuns)

const isValidRuntimeValue = (v) => isWord(v) || (is_list(v) && v.every(isValidRuntimeValue))

const coreJsFunctions = await import('./core.js')
const importFunctions = {}
for (const [name, f] of Object.entries(coreJsFunctions)) {
  importFunctions[name.replace(/_/g, '-')] = f
}
export const defineImportFunction = (name, f) => {
  // if (name in importFunctions) throw new Error(`function ${name} already defined`)
  importFunctions[name] = f
}
const globalVarValues = new Map()
const globalVarSet = (name, value) => {
  if (globalVarValues.has(name)) throw new Error('global variable already defined: ' + name)
  globalVarValues.set(name, value)
}
const globalEnv = { varValues: globalVarValues, outer: null }
const assert = (cond, msg) => {
  if (!cond) throw new Error('eval assert failed: ' + msg)
}

export const parseStringToForms = (content) => parser.parse(content).rootNode.children.map(nodeToOurForm)

let currentFilename = null

const evalLogForms = (evalWuns, forms, filename) => {
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

export const parseEvalFile = (evaluator, filename) => {
  const { evalWuns } = evaluator
  const content = fs.readFileSync(filename, 'utf8')
  evalLogForms(evalWuns, parseStringToForms(content), filename)
}

import path from 'node:path'

export const makeEvaluator = () => {
  const apply = ({ name, params, restParam, cbodies }, args) => {
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
    if (!cbodies) throw new Error('no cbodies')
    for (const cbody of cbodies) result = cbody(inner)
    return result
  }
  const wunsComp = (form) => {
    if (is_word(form)) {
      const v = wordValue(form)
      return (env) => {
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
    }
    assert(is_list(form), `cannot eval ${form} expected word or list`)
    if (form.length === 0) return () => form
    const [firstForm, ...args] = form
    const firstWordValue = wordValue(firstForm)
    switch (firstWordValue) {
      case 'quote': {
        const res = args.length === 1 ? args[0] : Object.freeze(args)
        return () => res
      }
      case 'if': {
        const ifArgs = [...args, unit, unit, unit].slice(0, 3)
        const [cc, ct, cf] = ifArgs.map(wunsComp)
        return (env) => {
          const evaledCond = cc(env)
          const isZeroWord = evaledCond === 0 || (is_word(evaledCond) && wordValue(evaledCond) === 0)
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
        return () => {
          fObj.cbodies = cbodies
          return unit
        }
      }
      case 'constant': {
        const [varName, value] = args
        const compValue = wunsComp(value)
        const vn = wordValue(varName)
        return (env) => {
          globalVarSet(vn, compValue(env))
          return unit
        }
      }
      case 'external-func': {
        if (args.length !== 3) throw new Error('external-func expects 3 arguments')
        const [name, params, results] = args
        // funcEnv.set(wordValue(name), func)
        const funcObj = importFunctions[wordValue(name)]
        assert(funcObj, `extern function ${name} not found`)
        if (!(typeof funcObj === 'function')) throw new Error(`expected function, found ${funcObj}`)
        const parameterCount = funcObj.length
        assert(is_list(params), `extern expected list of parameters, found ${params}`)
        assert(
          params.length === parameterCount,
          `extern function ${name} expected ${parameterCount} arguments, got ${params.length}`,
        )
        for (const param of params) if (!is_word(param)) throw new Error('extern expected word arguments')
        return () => {
          globalVarSet(wordValue(name), funcObj)
          return unit
        }
      }
      case 'import': {
        const [module] = args
        const importPath = path.resolve(currentFilename, '..', wordValue(module))
        parseEvalFile({ evalWuns }, importPath)
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
      if (isMacro) {
        const res = apply(
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
        apply(
          funcOrMacro,
          cargs.map((carg) => carg(env)),
        )
    } catch (e) {
      console.error('error evaluating', firstWordValue)
      throw e
    }
  }
  const evalWuns = (form) => {
    return wunsComp(form)(globalEnv)
  }

  return {
    evalWuns,
    apply,
    getExport: (name) => globalVarValues.get(name),
  }
}

export const nodeToOurForm = (node) => {
  const { type, text, namedChildren, startPosition, endPosition } = node
  const range = makeList(...[startPosition.row, startPosition.column, endPosition.row, endPosition.column])
  const metaData = makeList(word('range'), range, word('node-id'), node.id)
  // todo handle error nodes
  switch (type) {
    case 'word':
      return wordWithMeta(text, metaData)
    case 'list':
      return listWithMeta(namedChildren.map(nodeToOurForm), metaData)
    default:
      console.error('unexpected node type', node, { startPosition, endPosition })
      throw new Error('unexpected node type: ' + type + ' ' + JSON.stringify({ startPosition, endPosition }))
  }
}

export const evalTree = ({ evalWuns }, tree, filename) => {
  const forms = tree.rootNode.children.map(nodeToOurForm)
  evalLogForms(evalWuns, forms, filename)
}