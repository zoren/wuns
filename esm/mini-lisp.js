const makeEnv = (outer) => {
  const env = new Map()
  if (outer) {
    env.outer = outer
    const { invocation } = outer
    if (invocation) env.invocation = invocation
  }
  return env
}
const hasLocal = (env, varName) => {
  let curEnv = env
  while (curEnv) {
    if (curEnv.has(varName)) return true
    curEnv = curEnv.outer
  }
  return false
}
const setEnv = (env, varName, value) => {
  env.set(varName, value)
}

class Closure {
  constructor(env, name, parameters, body, isMacro) {
    this.env = env
    this.name = name
    this.parameters = parameters
    this.body = body
    this.isMacro = isMacro
  }
}

const makeClosure = (env, name, parameters, body, isMacro) =>
  Object.freeze(new Closure(env, name, parameters, body, isMacro))
import { isForm, tryGetFormWord, tryGetFormList } from './core.js'

const printForm = (form) => {
  const word = tryGetFormWord(form)
  if (word) return word
  const list = tryGetFormList(form)
  if (list) return `[${list.map(printForm).join(' ')}]`
  throw new Error('unexpected form: ' + form)
}

const langUndefined = Symbol('undefined')

const print = (value) => {
  if (value === langUndefined) return '[]'
  if (typeof value === 'string') return `[word ${value}]`
  if (typeof value === 'number') return `[i32 ${value}]`
  if (isForm(value)) return `[quote ${printForm(value)}]`
  if (Array.isArray(value)) return `[${value.map(print).join(' ')}]`
  if (typeof value === 'function') return '[func]'
  if (value instanceof Closure) return `[closure ${value.name} ${value.parameters.join(' ')}]`
  throw new Error('unexpected value: ' + value)
}

const list = (...args) => Object.freeze(args)

const setParameters = (parameters, paramEnv, eargs) => {
  if (parameters.length > 1 && parameters.at(-2) === '..') {
    const restParam = parameters.at(-1)
    parameters = parameters.slice(0, -2)
    setEnv(paramEnv, restParam, list(...eargs.slice(parameters.length)))
  }
  parameters.forEach((param, i) => setEnv(paramEnv, param, eargs[i]))
}

const makeParamEnv = (defFunc, args) => {
  const paramEnv = makeEnv(defFunc.env)
  setParameters(defFunc.parameters, paramEnv, args)
  paramEnv.invocation = { closure: defFunc, paramEnv }
  return paramEnv
}

import { meta } from './core.js'

class EvalError extends Error {
  constructor(message, form) {
    super(message)
    this.form = form
  }
}

const getFormWord = (form) => {
  const word = tryGetFormWord(form)
  if (word) return word
  throw new EvalError('expected word', form)
}

const getFormList = (form) => {
  const list = tryGetFormList(form)
  if (list) return list
  throw new EvalError('expected list', form)
}

const makeEvaluator = (externObj) => {
  const defEnv = new Map()
  const go = (env, form) => {
    const evalError = (message) => new EvalError(message, form)
    while (true) {
      const word = tryGetFormWord(form)
      if (word) {
        let curEnv = env
        while (curEnv) {
          if (curEnv.has(word)) return curEnv.get(word)
          curEnv = curEnv.outer
        }
        if (!defEnv.has(word)) throw evalError('undefined variable: ' + word)
        return defEnv.get(word)
      }
      const list = getFormList(form)
      if (list.length === 0) throw evalError('empty list')
      const [firstForm] = list
      const assertNumArgs = (num) => {
        if (list.length - 1 !== num) throw evalError('expected ' + num + ' arguments')
      }
      const firstWord = tryGetFormWord(firstForm)
      switch (firstWord) {
        case 'i32':
          assertNumArgs(1)
          return +getFormWord(list[1]) | 0
        case 'word':
          assertNumArgs(1)
          return getFormWord(list[1])
        case 'quote':
          assertNumArgs(1)
          return list[1]
        case 'func':
        case 'macro': {
          assertNumArgs(3)
          const name = getFormWord(list[1])
          const parameters = getFormList(list[2]).map(getFormWord)
          const body = list[3]
          return makeClosure(env, name, parameters, body, firstWord === 'macro')
        }
        case 'extern': {
          let ext = externObj
          for (let i = 1; i < list.length; i++) {
            const prop = getFormWord(list[i])
            const extProp = ext[prop]
            if (extProp === undefined) throw evalError('undefined extern: ' + prop + ' in ' + ext)
            ext = extProp
          }
          return ext
        }
        case 'def': {
          assertNumArgs(2)
          const name = getFormWord(list[1])
          const value = go(env, list[2])
          defEnv.set(name, value)
          return value
        }

        case 'if':
          assertNumArgs(3)
          form = list[go(env, list[1]) ? 2 : 3]
          continue
        case 'do':
          if (list.length === 1) return langUndefined
          for (let i = 1; i < list.length - 1; i++) go(env, list[i])
          form = list.at(-1)
          continue
        case 'let': {
          assertNumArgs(2)
          const bindings = getFormList(list[1])
          if (bindings.length % 2 !== 0) throw evalError('odd number of bindings')
          const newEnv = makeEnv(env)
          for (let i = 0; i < bindings.length - 1; i += 2)
            setEnv(newEnv, getFormWord(bindings[i]), go(newEnv, bindings[i + 1]))
          env = newEnv
          form = list[2]
          continue
        }
        case 'recur': {
          const eargs = list.slice(1).map((arg) => go(env, arg))
          const { closure, paramEnv } = env.invocation
          const { parameters, body } = closure
          setParameters(parameters, paramEnv, eargs)
          form = body
          continue
        }
      }
      const args = list.slice(1)
      if (firstWord && !hasLocal(env, firstWord)) {
        const closure = defEnv.get(firstWord)
        if (closure instanceof Closure && closure.isMacro) {
          const macroResult = go(makeParamEnv(closure, args), closure.body)
          const assertFormDeep = (macGenForm) => {
            if (tryGetFormWord(macGenForm)) return
            const list = tryGetFormList(macGenForm)
            if (!list) {
              console.error({ macGenForm })
              throw new EvalError('unexpected form generated by macro', form)}
            list.forEach(assertFormDeep)
          }
          assertFormDeep(macroResult)
          form = macroResult
          continue
        }
      }
      {
        const func = go(env, firstForm)
        const eargs = args.map((arg) => go(env, arg))
        if (typeof func === 'function') return func(...eargs)
        if (!(func instanceof Closure)) throw evalError('not a function')
        if (func.isMacro) throw evalError('macro not allowed here')
        env = makeParamEnv(func, eargs)
        form = func.body
        continue
      }
    }
  }
  return (form) => {
    try {
      return go(makeEnv(), form)
    } catch (e) {
      console.error(e, meta(form))
    }
  }
}

import { formWord, formList } from './core.js'

import { parse } from './parseTreeSitter.js'

function* parseToForms(content, metaPrefix) {
  const makeMeta = metaPrefix ? (...args) => list(metaPrefix, ...args) : list
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const nodeToForm = (node) => {
    const { isError, type, startPosition } = node
    if (isError) throw new Error('unexpected error node')
    const { row, column } = startPosition
    const metaData = makeMeta(row + 1, column + 1)
    switch (type) {
      case 'word':
        return formWord(node.text, metaData)
      case 'list':
        return formList(Object.freeze(node.namedChildren.map(nodeToForm)), metaData)
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  for (const child of parse(content).rootNode.namedChildren) yield nodeToForm(child)
}

import { jsHost } from './host-js.js'
const { host } = jsHost

import { instructionFunctions } from './instructions.js'
import { wrapJSFunctionsToObject } from './utils.js'

const instructions = wrapJSFunctionsToObject(instructionFunctions)

import { setMeta } from './core.js'

const externs = {
  host,
  instructions,

  'performance-now': () => performance.now(),
  'extern-with-meta': (ext, meta_data) => {
    if (typeof ext !== 'function') throw new Error('extern-with-meta expects function')
    const clone = (...args) => ext(...args)
    setMeta(clone, meta_data)
    return Object.freeze(clone)
  },
}

import fs from 'node:fs'

const commandLineArgs = process.argv.slice(2)
const endsWithDashFlag = commandLineArgs.at(-1) === '-'
const files = endsWithDashFlag ? commandLineArgs.slice(0, -1) : commandLineArgs
const evaluate = makeEvaluator(externs)
for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'ascii')
  const forms = parseToForms(content, filePath)
  for (const form of forms) evaluate(form)
}
import { startRepl } from './repl-util.js'

if (!endsWithDashFlag) {
  startRepl('mini-lisp-history.json', 'mini-lisp> ', (line) => {
    try {
      let result
      for (const form of parseToForms(line)) result = evaluate(form)
      console.log(print(result))
    } catch (err) {
      console.error(err)
    }
  })
}
