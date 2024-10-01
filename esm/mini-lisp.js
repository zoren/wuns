export const makeDefEnv = () => new Map()
const makeEnv = (outer) => {
  if (!(outer instanceof Map)) throw new Error('makeEnv expects a Map')
  const env = new Map()
  env.outer = outer
  return env
}
const setEnv = (env, varName, value) => {
  env.set(varName, value)
}

const list = (...args) => Object.freeze(args)

const parseParameters = (parameters) => {
  if (parameters.length > 1 && parameters.at(-2) === '..')
    return { restParam: parameters.at(-1), regularParameters: parameters.slice(0, -2) }
  return { restParam: null, regularParameters: parameters }
}

const setParametersStaged = (closure) => {
  const { closureName, parameters, env } = closure
  const { regularParameters, restParam } = parseParameters(parameters)
  if (!restParam)
    return (eargs) => {
      const paramEnv = makeEnv(env)
      setEnv(paramEnv, closureName, closure)
      if (eargs.length !== regularParameters.length)
        throw new EvalError(`${closureName} expected ${regularParameters.length} arguments, got ${eargs.length}`)
      for (let i = 0; i < regularParameters.length; i++) setEnv(paramEnv, regularParameters[i], eargs[i])
      return paramEnv
    }
  return (eargs) => {
    const paramEnv = makeEnv(env)
    setEnv(paramEnv, closureName, closure)
    if (eargs.length < regularParameters.length)
      throw new EvalError(`${closureName} expected at least ${regularParameters.length} arguments, got ${eargs.length}`)
    for (let i = 0; i < regularParameters.length; i++) setEnv(paramEnv, regularParameters[i], eargs[i])
    setEnv(paramEnv, restParam, list(...eargs.slice(regularParameters.length)))
    return paramEnv
  }
}

class Closure extends Function {
  constructor(env, name, parameters, body, kind) {
    let paramEnvMaker
    const f = (...args) => evalForm(paramEnvMaker(args), body)
    f.env = env
    f.closureName = name
    f.parameters = parameters
    f.body = body
    f.kind = kind
    f.toString = () => `[closure ${name} ${parameters.join(' ')}]`
    paramEnvMaker = setParametersStaged(f)
    f.paramEnvMaker = paramEnvMaker
    // https://stackoverflow.com/questions/36871299/how-to-extend-function-with-es6-classes
    return Object.setPrototypeOf(f, new.target.prototype)
  }
}

const makeClosure = (env, name, parameters, body, kind) => Object.freeze(new Closure(env, name, parameters, body, kind))
const isClosure = (v) => v instanceof Closure
import {
  tryGetFormWord,
  tryGetFormList,
  isTaggedValue,
  makeValueTagger,
  isWord,
  atom,
  makeRecord,
  getRecordType,
  print,
  formWord,
  formList,
} from './core.js'

const printForm = (form) => {
  const word = tryGetFormWord(form)
  if (word) return word
  const list = tryGetFormList(form)
  if (list) return `[${list.map(printForm).join(' ')}]`
  throw new Error('unexpected form: ' + form)
}

export const langUndefined = Symbol('undefined')

import { meta } from './core.js'

class EvalError extends Error {
  constructor(message, form, innerError) {
    super(message)
    this.form = form
    this.innerError = innerError
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
    if (!list) {
      console.dir(f, { depth: 10 })
      throw new EvalError('not a form', form)
    }
    list.forEach(go)
  }
  go(form)
}

import { jsHost } from './host-js.js'
const { host } = jsHost

import { instructionFunctions } from './instructions.js'
import { wrapJSFunctionsToObject } from './utils.js'
import fs from 'node:fs'

import { parse } from './parseTreeSitter.js'

const instructions = wrapJSFunctionsToObject(instructionFunctions)

const externs = {
  host,
  instructions,

  'performance-now': () => performance.now(),
}

export function* parseToForms(content, contentName) {
  if (!isWord(contentName)) throw new Error('contentName must be a word')
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const nodeToForm = (node) => {
    const { isError, type, startPosition, endPosition } = node
    if (isError) {
      console.dir({ metaPrefix: contentName, startPosition, endPosition })
      throw new Error('unexpected error node')
    }
    const { row, column } = startPosition
    const metaData = list(contentName, row + 1, column + 1)
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

export const readFile = (filePath) => parseToForms(fs.readFileSync(filePath, 'ascii'), filePath)

export const evalForm = (env, form) => {
  const curForm = form
  const evalError = (message, innerError) => new EvalError(message, curForm, innerError)
  while (true) {
    const word = tryGetFormWord(form)
    if (word) {
      let curEnv = env
      while (curEnv) {
        if (curEnv.has(word)) return curEnv.get(word)
        curEnv = curEnv.outer
      }
      throw evalError('undefined variable: ' + word)
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
      case 'fexpr':
      case 'macro': {
        assertNumArgs(3)
        const name = getFormWord(forms[1])
        const parameters = getFormList(forms[2]).map(getFormWord)
        const body = forms[3]
        return makeClosure(env, name, parameters, body, firstWord)
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
        const value = evalForm(env, forms[2])
        if (env.outer) throw evalError('def must be defined in the outermost environment')
        env.set(name, value)
        return value
      }
      case 'atom': {
        assertNumArgs(1)
        const initialValue = evalForm(env, forms[1])
        return atom(initialValue)
      }

      case 'loop':
      case 'continue':
      case 'recur':
        throw evalError('unexpected ' + firstWord)

      case 'if':
        assertNumArgs(3)
        try {
          form = forms[evalForm(env, forms[1]) ? 2 : 3]
        } catch (e) {
          throw evalError('error in if condition', e)
        }
        continue
      case 'match': {
        if (numOfArgs === 0) throw evalError(`special form '${firstWord}' expected at least one argument`)
        const value = evalForm(env, forms[1])
        if (!isTaggedValue(value)) {
          console.dir(value)
          throw evalError('expected tagged value')
        }
        const { tag, args } = value
        const findMatch = () => {
          for (let i = 2; i < forms.length - 1; i += 2) {
            const patternList = getFormList(forms[i])
            const patternCtorFunc = evalForm(env, patternList[0])
            if (typeof patternCtorFunc !== 'function') throw evalError('expected function')
            if (typeof patternCtorFunc.tag !== 'string') throw evalError('expected ctor function')
            if (patternCtorFunc.tag !== tag) continue
            if (patternList.length - 1 !== args.length)
              throw evalError(
                `pattern length ${patternList.length - 1} but value length was ${args.length} ${tag} ${args} ${meta(patternList[0])}`,
              )
            const newEnv = makeEnv(env)
            for (let j = 1; j < patternList.length; j++) setEnv(newEnv, getFormWord(patternList[j]), args[j - 1])
            return { newEnv, body: forms[i + 1] }
          }
          // an odd number of arguments means there is no default case
          if (numOfArgs % 2 === 1) {
            console.dir(value)
            throw evalError('no match found')
          }
          return { newEnv: env, body: forms.at(-1) }
        }
        const { newEnv, body } = findMatch()
        env = newEnv
        form = body
        continue
      }
      case 'type': {
        if (numOfArgs % 3 !== 0) throw evalError('type expected triplets')
        if (env.outer) throw evalError('type must be defined in the outermost environment')
        for (let i = 1; i < forms.length; i += 3) {
          const type = getFormWord(forms[i])
          const _typeParams = getFormList(forms[i + 1]).map(getFormWord)
          const body = getFormList(forms[i + 2])
          const firstBodyWord = getFormWord(body[0])
          switch (firstBodyWord) {
            case 'union':
              for (let i = 1; i < body.length; i++) {
                const unionCase = getFormList(body[i])
                if (unionCase.length === 0) throw evalError('union case must have at least one word')
                const unionCaseName = getFormWord(unionCase[0])
                const qualName = `${type}/${unionCaseName}`
                const tagger = makeValueTagger(qualName, unionCase.length - 1)
                env.set(qualName, tagger)
              }
              break
            case 'record': {
              const fieldNames = []
              for (let i = 1; i < body.length; i++) {
                const recordField = getFormList(body[i])
                if (recordField.length < 2) throw evalError('record field must have a name and a type')
                const fieldName = getFormWord(recordField[0])
                fieldNames.push(fieldName)
                const projecterName = `${type}/${fieldName}`
                const projecter = (record) => {
                  if (getRecordType(record) !== type) throw evalError(`field projecter ${projecterName} not a ${type}`)
                  return record[fieldName]
                }
                env.set(projecterName, projecter)
              }
              const constructor = (...args) => makeRecord(type, fieldNames, args)
              env.set(type, constructor)
              break
            }
            default:
              throw evalError('unexpected type body: ' + firstBodyWord)
          }
        }
        return langUndefined
      }
      case 'do':
        if (forms.length === 1) return langUndefined
        try {
          for (let i = 1; i < forms.length - 1; i++) evalForm(env, forms[i])
        } catch (e) {
          throw evalError('error in do', e)
        }
        form = forms.at(-1)
        continue
      case 'let': {
        assertNumArgs(2)
        const bindings = getFormList(forms[1])
        if (bindings.length % 2 !== 0) throw evalError('odd number of bindings')
        const newEnv = makeEnv(env)
        try {
          for (let i = 0; i < bindings.length - 1; i += 2)
            setEnv(newEnv, getFormWord(bindings[i]), evalForm(newEnv, bindings[i + 1]))
        } catch (e) {
          throw evalError('error in let bindings', e)
        }
        env = newEnv
        form = forms[2]
        continue
      }
      case 'type-anno': {
        assertNumArgs(2)
        form = forms[1]
        continue
      }
      case 'load': {
        assertNumArgs(1)
        const filePath = getFormWord(forms[1])
        for (const newForm of readFile(filePath)) evalForm(env, newForm)
        return langUndefined
      }
    }
    const func = evalForm(env, firstForm)
    const args = forms.slice(1)
    if (!isClosure(func)) {
      if (typeof func === 'function') {
        try {
          return func(...args.map((arg) => evalForm(env, arg)))
        } catch (e) {
          throw evalError('error in function call', e)
        }
      }
      throw evalError('not a function')
    }
    const { kind, paramEnvMaker, body } = func
    switch (kind) {
      case 'macro': {
        const macroResult = evalForm(paramEnvMaker(args), body)
        assertFormDeep(macroResult)
        form = macroResult
        continue
      }
      case 'fexpr':
        return evalForm(paramEnvMaker(args), body)
      case 'func':
        env = paramEnvMaker(args.map((arg) => evalForm(env, arg)))
        form = body
        continue
      default:
        throw evalError('unexpected closure kind: ' + kind + ' ' + func)
    }
  }
}

export const catchErrors = (f) => {
  try {
    return f()
  } catch (e) {
    // console.dir(e)
    console.log('catchErrors', e.message, e.form, e.innerError ? 'has inner' : '')
    let curErr = e
    while (curErr) {
      const dumpFormMeta = (form) => {
        const word = tryGetFormWord(form)
        if (word) return `'${word}' ${meta(form)}`
        const list = tryGetFormList(form)
        if (list) return `[${list.map(dumpFormMeta).join(' ')} ${meta(form)}]`
        // throw new Error('unexpected form: ' + form)
        console.log('form was', form)
        return '???'
      }
      console.error(curErr, dumpFormMeta(curErr.form))
      curErr = curErr.innerError
    }
  }
}

const none = makeValueTagger('option/none', 0)()
const some = makeValueTagger('option/some', 1)

externs.interpreter = {
  'make-context': () => new Map(),
  'try-get-macro': (context, name) => {
    if (!(context instanceof Map)) throw new Error('try-get-macro expects context')
    if (typeof name !== 'string') throw new Error('try-get-macro expects string')
    const value = context.get(name)
    if (isClosure(value) && value.kind === 'macro') return some(value)
    return none
  },
  evaluate: (context, form) => {
    if (!(context instanceof Map)) throw new Error('evaluate expects context')
    try {
      return evalForm(context, form)
    } catch (e) {
      return 0
    }
  },
  apply: (func, args) => {
    if (!isClosure(func)) throw new Error('apply expects closure')
    if (!Array.isArray(args)) throw new Error('apply expects array')
    const paramEnv = func.paramEnvMaker(args)
    return evalForm(paramEnv, func.body)
  },
  'read-file': (path) => {
    if (typeof path !== 'string') throw new Error('read-file expects string')
    return Object.freeze([...readFile(path)])
  },
}
Object.freeze(externs.interpreter)
Object.freeze(externs)
