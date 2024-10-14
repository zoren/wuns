import externs from './externs.js'
const defEnvTag = Symbol('def-env')
export const makeDefEnv = (currentDir) => {
  if (!currentDir) throw new Error('makeDefEnv expects currentDir')
  if (typeof currentDir !== 'string') throw new Error('currentDir must be a string')
  const defMap = new Map()
  defMap[defEnvTag] = true
  defMap.currentDir = currentDir
  return defMap
}
const isDefEnv = (v) => v instanceof Map && v[defEnvTag]
const makeEnv = (outer) => {
  if (!(outer instanceof Map)) throw new Error('makeEnv expects a Map')
  const env = new Map()
  env.outer = outer
  return env
}
const setEnv = (env, varName, value) => {
  env.set(varName, value)
}

const getPathRelativeToCurrentDir = (defEnv, relativeFilePath) => {
  const { currentDir } = defEnv
  if (!currentDir) throw new Error('load expects currentDir')
  if (typeof currentDir !== 'string') throw new Error('currentDir must be a string')
  return path.join(currentDir, relativeFilePath)
}

class Closure extends Function {
  constructor(f, kind, paramEnvMaker, body) {
    f.kind = kind
    f.paramEnvMaker = paramEnvMaker
    f.body = body
    // https://stackoverflow.com/questions/36871299/how-to-extend-function-with-es6-classes
    return Object.setPrototypeOf(f, new.target.prototype)
  }
}

const makeClosure = (f, kind, paramEnvMaker, body) => Object.freeze(new Closure(f, kind, paramEnvMaker, body))
export const isClosure = (v) => v instanceof Closure
import {
  tryGetFormWord,
  tryGetFormList,
  isTaggedValue,
  makeValueTagger,
  atom,
  getRecordType,
  emptyList,
  langUndefined,
  isForm,
  makeList,
  readFile,
  optionNone,
  makeOptionSome,
  makeRecordFromObj,
} from './core.js'
import path from 'node:path'

const printForm = (form) => {
  const word = tryGetFormWord(form)
  if (word) return word
  const list = tryGetFormList(form)
  if (list) return `[${list.map(printForm).join(' ')}]`
  throw new Error('unexpected form: ' + form)
}

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

import { instructionFunctions } from './instructions.js'
import { wrapJSFunctionsToObject } from './utils.js'

const instructions = wrapJSFunctionsToObject(instructionFunctions)
const intrinsics = instructions

export const evalForm = (defEnv, topForm) => {
  if (!isDefEnv(defEnv)) throw new Error('first argument must be a defEnv')
  // we need an extern func that gives access to the current directory or the file path of the current dir
  // this allows writing load as a macro also we can make
  // this function is not pure as it needs access to a non-variable on defEnv
  const externCurrentDir = () => defEnv.currentDir
  const instanceExterns = { ...externs, 'current-dir': externCurrentDir }
  const go = (env, form) => {
    const evalError = (message, innerError) => new EvalError(message, form, innerError)
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
      const forms = tryGetFormList(form)
      if (!forms) {
        // here we throw an Error not an evalError as the input is not a form
        throw new Error('expected a valid form value', { cause: form })
      }
      if (forms.length === 0) throw evalError('empty list')

      const [firstForm] = forms
      const firstWord = tryGetFormWord(firstForm)
      const numOfArgs = forms.length - 1
      const assertNumArgs = (num) => {
        if (numOfArgs !== num)
          throw evalError(`special form '${firstWord}' expected ${num} arguments, got ${numOfArgs}`)
      }
      const makeClosureOfKind = (kind) => {
        const name = getFormWord(forms[1])
        const parameters = getFormList(forms[2]).map(getFormWord)
        const body = forms[3]
        let closure
        const paramEnvMaker = (() => {
          if (parameters.length < 2 || parameters.at(-2) !== '..') {
            const arity = parameters.length
            return (eargs) => {
              const paramEnv = makeEnv(env)
              setEnv(paramEnv, name, closure)
              if (eargs.length !== arity)
                throw new EvalError(`${name} expected ${arity} arguments, got ${eargs.length}`)
              for (let i = 0; i < arity; i++) setEnv(paramEnv, parameters[i], eargs[i])
              return paramEnv
            }
          }
          const restParam = parameters.at(-1)
          const regularParameters = parameters.slice(0, -2)
          const arity = regularParameters.length
          return (eargs) => {
            const paramEnv = makeEnv(env)
            setEnv(paramEnv, name, closure)
            if (eargs.length < arity)
              throw new EvalError(`${name} expected at least ${arity} arguments, got ${eargs.length}`)
            for (let i = 0; i < arity; i++) setEnv(paramEnv, regularParameters[i], eargs[i])
            setEnv(paramEnv, restParam, makeList(...eargs.slice(arity)))
            return paramEnv
          }
        })()
        const f = (...args) => go(paramEnvMaker(args), body)
        closure = makeClosure(f, kind, paramEnvMaker, body)
        return closure
      }
      switch (firstWord) {
        // constants
        case 'i32':
          assertNumArgs(1)
          const v = +getFormWord(forms[1])
          const normalized = v | 0
          if (v !== normalized) throw evalError('expected i32')
          return normalized
        case 'f64': {
          assertNumArgs(1)
          const v = +getFormWord(forms[1])
          if (isNaN(v)) throw evalError('expected number')
          return v
        }
        case 'word':
          assertNumArgs(1)
          return getFormWord(forms[1])
        case 'extern': {
          let ext = instanceExterns
          for (let i = 1; i < forms.length; i++) {
            const prop = getFormWord(forms[i])
            const extProp = ext[prop]
            // if (extProp === undefined) throw evalError('undefined extern: ' + prop + ' in ' + ext)
            if (extProp === undefined) return langUndefined
            ext = extProp
          }
          return ext
        }
        case 'intrinsic': {
          let intrinsic = intrinsics
          for (let i = 1; i < forms.length; i++) {
            const prop = getFormWord(forms[i])
            const intrinsicProperty = intrinsic[prop]
            if (intrinsicProperty === undefined) throw evalError('undefined intrinsic: ' + prop + ' in ' + intrinsic)
            intrinsic = intrinsicProperty
          }
          return intrinsic
        }
        case 'fexpr':
          throw evalError('closure fexprs are not allowed anymore')
        case 'macro':
          throw evalError('closure macros are not allowed anymore')
        case 'defexpr': {
          assertNumArgs(3)
          if (env !== defEnv) throw evalError('defmacro defined in the outermost environment')
          const name = getFormWord(forms[1])
          const closure = makeClosureOfKind('fexpr')
          defEnv.set(name, closure)
          return langUndefined
        }
        case 'defmacro': {
          assertNumArgs(3)
          if (env !== defEnv) throw evalError('defmacro defined in the outermost environment')
          const name = getFormWord(forms[1])
          const closure = makeClosureOfKind('macro')
          defEnv.set(name, closure)
          return langUndefined
        }
        // constants calculated from environment
        case 'func': {
          assertNumArgs(3)
          return makeClosureOfKind(firstWord)
        }
        case 'atom': {
          assertNumArgs(1)
          const initialValue = go(env, forms[1])
          return atom(initialValue)
        }
        // control flow
        case 'if':
          assertNumArgs(3)
          try {
            form = forms[go(env, forms[1]) !== 0 ? 2 : 3]
          } catch (e) {
            throw evalError('error in if condition', e)
          }
          continue
        case 'switch': {
          if (numOfArgs < 2) throw evalError(`special form 'switch' expected at least two arguments`)
          if (numOfArgs % 2 !== 0) throw evalError('no switch default found')
          const value = go(env, forms[1])
          form = forms.at(-1)
          for (let i = 2; i < forms.length - 1; i += 2) {
            if (getFormList(forms[i]).some((patForm) => go(env, patForm) === value)) {
              form = forms[i + 1]
              break
            }
          }
          continue
        }
        case 'match': {
          if (numOfArgs === 0) throw evalError(`special form '${firstWord}' expected at least one argument`)
          const value = go(env, forms[1])
          if (!isTaggedValue(value)) throw evalError('expected tagged value')
          const findMatch = () => {
            for (let i = 2; i < forms.length - 1; i += 2) {
              const pattern = forms[i]
              const patternList = getFormList(pattern)
              if (patternList.length === 0) throw evalError('pattern must have at least one word')
              const { tag, args } = value
              const patternCtorFunc = go(env, patternList[0])
              if (typeof patternCtorFunc !== 'function') throw evalError('expected function')
              if (typeof patternCtorFunc.tag !== 'string') throw evalError('expected ctor function')
              if (patternCtorFunc.tag !== tag) continue
              if (patternList.length - 1 !== args.length)
                throw evalError(
                  `pattern length ${patternList.length - 1} but value length was ${args.length} ${tag} ${args}`,
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
        case 'do':
          if (forms.length === 1) return langUndefined
          try {
            for (let i = 1; i < forms.length - 1; i++) go(env, forms[i])
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
              setEnv(newEnv, getFormWord(bindings[i]), go(newEnv, bindings[i + 1]))
          } catch (e) {
            throw evalError('error in let bindings', e)
          }
          env = newEnv
          form = forms[2]
          continue
        }
        case 'letrec': {
          assertNumArgs(2)
          const bindings = getFormList(forms[1])
          if (bindings.length % 2 !== 0) throw evalError('odd number of bindings')
          const newEnv = makeEnv(env)
          try {
            const values = []
            for (let i = 0; i < bindings.length - 1; i += 2) values.push(go(newEnv, bindings[i + 1]))
            for (let i = 0; i < bindings.length - 1; i += 2) setEnv(newEnv, getFormWord(bindings[i]), values[i / 2])
          } catch (e) {
            throw evalError('error in let bindings', e)
          }
          env = newEnv
          form = forms[2]
          continue
        }
        case 'letfn': {
          assertNumArgs(2)
          const functionsList = getFormList(forms[1])
          const funcs = functionsList.map((funcForm) => {
            const funcList = getFormList(funcForm)
            if (funcList.length !== 4) throw evalError('letfn function must have three forms')
            const kind = getFormWord(funcList[0])
            if (kind !== 'func') throw evalError('unexpected function kind: ' + kind)
            const name = getFormWord(funcList[1])
            return { name, funcForm }
          })
          const newEnv = makeEnv(env)
          try {
            const values = []
            for (const func of funcs) values.push(go(newEnv, func.funcForm))
            for (let i = 0; i < funcs.length; i++) setEnv(newEnv, funcs[i].name, values[i])
          } catch (e) {
            throw evalError('error in let bindings', e)
          }
          env = newEnv
          form = forms[2]
          continue
        }
        case 'def': {
          assertNumArgs(2)
          if (env !== defEnv) throw evalError('def must be defined in the outermost environment')
          const name = getFormWord(forms[1])
          const value = go(env, forms[2])
          defEnv.set(name, value)
          return value
        }
        // types
        case 'type': {
          if (numOfArgs % 3 !== 0) throw evalError('type expected triplets')
          if (env !== defEnv) throw evalError('type must be defined in the outermost environment')
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
                  defEnv.set(qualName, tagger)
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
                    if (getRecordType(record) !== type)
                      throw evalError(`field projecter ${projecterName} not a ${type}`)
                    return record[fieldName]
                  }
                  defEnv.set(projecterName, projecter)
                }
                const constructor = (...args) => {
                  if (args.length !== fieldNames.length) throw evalError('wrong number of arguments to ' + type)
                  const fieldObj = {}
                  for (let i = 0; i < fieldNames.length; i++) fieldObj[fieldNames[i]] = args[i]
                  return makeRecordFromObj(type, fieldObj)
                }
                defEnv.set(type, constructor)
                break
              }
              default:
                throw evalError('unexpected type body: ' + firstBodyWord)
            }
          }
          return langUndefined
        }
        case 'type-anno': {
          assertNumArgs(2)
          form = forms[1]
          continue
        }
        case 'load': {
          assertNumArgs(1)
          const relativeFilePath = getFormWord(forms[1])
          const resolvedPath = getPathRelativeToCurrentDir(defEnv, relativeFilePath)
          const fileForms = readFile(resolvedPath)
          let result = langUndefined
          for (const fileForm of fileForms) result = evalForm(defEnv, fileForm)
          return result
        }
      }
      const func = go(env, firstForm)
      const args = forms.slice(1)
      // closures are also functions so we to check if it is a closure first
      if (!isClosure(func)) {
        if (typeof func === 'function') {
          try {
            return func(...args.map((arg) => go(env, arg)))
          } catch (e) {
            throw evalError('error in function call', e)
          }
        }
        throw evalError('not a function')
      }
      const { kind, paramEnvMaker, body } = func
      switch (kind) {
        case 'macro': {
          const macroResult = go(paramEnvMaker(args), body)
          form = macroResult
          continue
        }
        case 'fexpr':
          env = paramEnvMaker(args)
          form = body
          continue
        case 'func':
          env = paramEnvMaker(args.map((arg) => go(env, arg)))
          form = body
          continue
        default:
          throw evalError('unexpected closure kind: ' + kind + ' ' + func)
      }
    }
  }
  return go(defEnv, topForm)
}

export const evaluateForms = (defEnv, forms) => {
  let result = langUndefined
  for (const form of forms) result = evalForm(defEnv, form)
  return result
}

export const evaluateFile = (defEnv, relativeFilePath) => {
  const resolvedPath = getPathRelativeToCurrentDir(defEnv, relativeFilePath)
  return evaluateForms(defEnv, readFile(resolvedPath))
}

import { print } from './core.js'

export const catchErrors = (f) => {
  try {
    return f()
  } catch (e) {
    console.log('catchErrors', e.message, e.form, e.innerError ? 'has inner' : '')
    let curErr = e
    while (curErr) {
      console.error(curErr.message, print(curErr.form))
      curErr = curErr.innerError
    }
  }
}

const error = makeValueTagger('result/error', 1)
const ok = makeValueTagger('result/ok', 1)

externs.interpreter = {
  'make-context': (currentDir) => {
    if (typeof currentDir !== 'string') throw new Error('make-context expects string')
    return makeDefEnv(currentDir)
  },
  'macro-expand': (context, form) => {
    if (!isDefEnv(context)) throw new Error('macro-expand expects context')
    if (!isForm(form)) throw new Error('macro-expand expects a form')
    const list = tryGetFormList(form)
    if (!list || list.length === 0) {
      console.log('expected non-empty list')
      return form
    }
    const firstWord = tryGetFormWord(list[0])
    if (!firstWord) {
      console.log('expected word first')
      return form
    }
    const defValue = context.get(firstWord)
    if (!defValue || !isClosure(defValue) || defValue.kind !== 'macro') {
      console.log('expected macro', defValue)
      return form
    }
    return defValue(...list.slice(1))
  },
  'try-get-macro': (context, name) => {
    if (!isDefEnv(context)) throw new Error('try-get-macro expects context')
    if (typeof name !== 'string') throw new Error('try-get-macro expects string')
    const value = context.get(name)
    if (isClosure(value) && value.kind === 'macro') return makeOptionSome(value)
    return optionNone
  },
  evaluate: (context, form) => {
    if (!isDefEnv(context)) throw new Error('evaluate expects context')
    try {
      evalForm(context, form)
    } catch (e) {
      console.error('evaluate error discarded')
      console.log(form)
      console.error(e)
    }
    return langUndefined
  },
  'evaluate-result': (context, form) => {
    if (!isDefEnv(context)) throw new Error('evaluate-result expects context')
    if (!isForm(form)) throw new Error('evaluate-result expects form')
    try {
      return ok(evalForm(context, form))
    } catch (e) {
      return error(e)
    }
  },
  // todo get rid of this
  'evaluate-list-num': (context, fname, args) => {
    if (!isDefEnv(context)) throw new Error('evaluate expects context')
    if (typeof fname !== 'string') throw new Error('evaluate expects string')
    if (!Array.isArray(args)) throw new Error('evaluate expects array')
    args.forEach((arg) => {
      if (typeof arg !== 'number') throw new Error('expected number')
    })
    try {
      const func = context.get(fname)
      const res = func(...args)
      if (res === langUndefined) return emptyList
      if (typeof res === 'number') return makeList(res)
      if (Array.isArray(res)) {
        for (const r of res) if (typeof r !== 'number') throw new Error('expected number')
        return res
      }
      throw new Error('expected number or list of numbers')
    } catch (e) {
      console.error('evaluate-list-num', e)
    }
    return emptyList
  },
  apply: (func, args) => {
    if (!isClosure(func)) throw new Error('apply expects closure')
    if (!Array.isArray(args)) throw new Error('apply expects array')
    return func(...args)
  },
}
Object.freeze(externs.interpreter)
