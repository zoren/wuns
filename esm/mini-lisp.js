const makeEnv = (outer) => {
  const env = new Map()
  if (outer) env.outer = outer
  return env
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
  if (Array.isArray(value)) return `[list${value.map((v) => ' ' + print(v)).join('')}]`
  if (typeof value === 'function') return '[func]'
  if (value instanceof Closure) return `[closure ${value.name} ${value.parameters.join(' ')}]`
  if (value === undefined) return '*undefined*'

  if (Object.isFrozen(value))
    return `[kv-mapq${Object.entries(value)
      .map(([k, v]) => ` ${k} ${print(v)}`)
      .join('')}]`
  return `[transient-kv-map${Object.entries(value)
    .map(([k, v]) => ` ${k} ${print(v)}`)
    .join('')}]`
}

const list = (...args) => Object.freeze(args)

const setParameters = (parameters, paramEnv, eargs) => {
  if (parameters.length > 1 && parameters.at(-2) === '..') {
    const restParam = parameters.at(-1)
    parameters = parameters.slice(0, -2)
    if (eargs.length < parameters.length)
      throw new EvalError('expected at least ' + parameters.length + ' arguments, got ' + eargs.length)
    setEnv(paramEnv, restParam, list(...eargs.slice(parameters.length)))
  } else {
    if (eargs.length !== parameters.length)
      throw new EvalError('expected ' + parameters.length + ' arguments, got ' + eargs.length)
  }
  parameters.forEach((param, i) => setEnv(paramEnv, param, eargs[i]))
}

const makeParamEnv = (defFunc, args) => {
  const paramEnv = makeEnv(defFunc.env)
  // for recursive calls
  setEnv(paramEnv, defFunc.name, defFunc)
  setParameters(defFunc.parameters, paramEnv, args)
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

const assertFormDeep = (form) => {
  const go = (f) => {
    if (tryGetFormWord(f)) return
    const list = tryGetFormList(f)
    if (!list) throw new EvalError('not a form', form)
    list.forEach(go)
  }
  go(form)
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
    const forms = getFormList(form)
    if (forms.length === 0) throw evalError('empty list')
    const [firstForm] = forms
    const firstWord = tryGetFormWord(firstForm)
    const numOfArgs = forms.length - 1
    const assertNumArgs = (num) => {
      if (numOfArgs !== num) throw evalError(`special form '${firstWord}' expected ${num} arguments, got ${numOfArgs}`)
    }
    switch (firstWord) {
      case 'i32':
        assertNumArgs(1)
        return +getFormWord(forms[1]) | 0
      case 'word':
        assertNumArgs(1)
        return getFormWord(forms[1])
      case 'quote': {
        assertNumArgs(1)
        const form = forms[1]
        assertFormDeep(form)
        return form
      }
      case 'func':
      case 'macro': {
        assertNumArgs(3)
        const name = getFormWord(forms[1])
        const parameters = getFormList(forms[2]).map(getFormWord)
        const body = forms[3]
        return makeClosure(env, name, parameters, body, firstWord === 'macro')
      }
      case 'extern': {
        let ext = externs
        for (let i = 1; i < forms.length; i++) {
          const prop = getFormWord(forms[i])
          const extProp = ext[prop]
          if (extProp === undefined) throw evalError('undefined extern: ' + prop + ' in ' + ext)
          ext = extProp
        }
        return ext
      }
      case 'def': {
        assertNumArgs(2)
        const name = getFormWord(forms[1])
        const value = go(env, forms[2])
        defEnv.set(name, value)
        return value
      }

      case 'loop':
      case 'continue':
      case 'recur':
        throw evalError('unexpected ' + firstWord)

      case 'if':
        assertNumArgs(3)
        form = forms[go(env, forms[1]) ? 2 : 3]
        continue
      case 'do':
        if (forms.length === 1) return langUndefined
        for (let i = 1; i < forms.length - 1; i++) go(env, forms[i])
        form = forms.at(-1)
        continue
      case 'let': {
        assertNumArgs(2)
        const bindings = getFormList(forms[1])
        if (bindings.length % 2 !== 0) throw evalError('odd number of bindings')
        const newEnv = makeEnv(env)
        for (let i = 0; i < bindings.length - 1; i += 2)
          setEnv(newEnv, getFormWord(bindings[i]), go(newEnv, bindings[i + 1]))
        env = newEnv
        form = forms[2]
        continue
      }
    }
    const func = go(env, firstForm)
    const args = forms.slice(1)
    if (typeof func === 'function') return func(...args.map((arg) => go(env, arg)))
    if (!(func instanceof Closure)) throw evalError('not a function')
    if (func.isMacro) {
      const macroResult = go(makeParamEnv(func, args), func.body)
      assertFormDeep(macroResult)
      form = macroResult
      continue
    }
    env = makeParamEnv(
      func,
      args.map((arg) => go(env, arg)),
    )
    form = func.body
    continue
  }
}
const evaluate = (form) => {
  try {
    return go(makeEnv(), form)
  } catch (e) {
    console.error(e, meta(form))
  }
}

const specialForms = ['i32', 'word', 'quote', 'func', 'macro', 'extern', 'def', 'if', 'do', 'let']

const getCompletions = (prefix) => {
  const completions = []
  for (const special of specialForms) if (special.startsWith(prefix)) completions.push(special)
  for (const key of defEnv.keys()) if (key.startsWith(prefix)) completions.push(key)
  return completions
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

import fs from 'node:fs'

const commandLineArgs = process.argv.slice(2)
const endsWithDashFlag = commandLineArgs.at(-1) === '-'
const files = endsWithDashFlag ? commandLineArgs.slice(0, -1) : commandLineArgs

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'ascii')
  const forms = parseToForms(content, filePath)
  for (const form of forms) evaluate(form)
}
import { startRepl } from './repl-util.js'

if (!endsWithDashFlag) {
  const evalLine = (line) => {
    try {
      let result
      for (const form of parseToForms(line)) result = evaluate(form)
      console.log(print(result))
    } catch (err) {
      console.error(err)
    }
  }
  const completer = (line) => {
    const m = line.match(/[a-z0-9./-]+$/)
    if (!m) return [[], '']
    const currentWord = m[0]
    const defs = getCompletions(currentWord)
    return [defs, currentWord]
  }
  startRepl('mini-lisp-history.json', 'mini-lisp> ', evalLine, completer)
}
