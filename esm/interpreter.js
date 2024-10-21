const makeEnv = (outer) => {
  if (!(outer instanceof Map)) throw new Error('makeEnv expects a Map')
  const env = new Map()
  env.outer = outer
  return env
}
const setEnv = (env, varName, value) => {
  env.set(varName, value)
}

import path from 'node:path'

const getPathRelativeToCurrentDir = (defEnv, relativeFilePath) => {
  const { currentDir } = defEnv
  if (!currentDir) throw new Error('load expects currentDir')
  if (typeof currentDir !== 'string') throw new Error('currentDir must be a string')
  return path.join(currentDir, relativeFilePath)
}

import {
  atom,
  getRecordType,
  isDefEnv,
  isTaggedValue,
  langUndefined,
  makeList,
  makeRecordFromObj,
  makeValueTagger,
  readFile,
  tryGetFormList,
  tryGetFormWord,
  makeClosure,
  tryGetClosureKind,
  makeFormWord,
  makeFormList,
  tryGetNodeFromForm,
} from './core.js'

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

import { setJSFunctionName } from './utils.js'

const intrinsics = {}

{
  const pushNamedFunc = (fname, ...args) => {
    const last = args.at(-1)
    const f = Function(
      'a',
      'b',
      `
    if (typeof a !== 'number') throw new Error('${fname} first arg is not a number');
    if (typeof b !== 'number') throw new Error('${fname} second arg is not a number');
    return (${last})`,
    )
    setJSFunctionName(f, fname)
    intrinsics[fname] = Object.freeze(f)
  }

  const i32Instructions = [
    { name: 'add', op: '+' },
    { name: 'sub', op: '-', alias: 'subtract' },
    { name: 'mul', op: '*', alias: 'multiply' },
    { name: 'div-s', op: '/', alias: 'divide-signed' },
    { name: 'rem-s', op: '%', alias: 'remainder-signed' },

    { name: 'eq', op: '===', alias: 'equals' },
    { name: 'ne', op: '!==', alias: 'not-equals' },

    { name: 'lt-s', op: '<', alias: 'less-than-signed' },
    { name: 'gt-s', op: '>', alias: 'greater-than-signed' },
    { name: 'le-s', op: '<=', alias: 'less-than-or-equal-signed' },
    { name: 'ge-s', op: '>=', alias: 'greater-than-or-equal-signed' },

    { name: 'and', op: '&', alias: 'bitwise-and' },
    { name: 'or', op: '|', alias: 'bitwise-ior' },
    { name: 'xor', op: '^', alias: 'bitwise-xor' },
    { name: 'shl', op: '<<', alias: 'bitwise-shift-left' },
    { name: 'shr-s', op: '>>', alias: 'bitwise-shift-right' },
    { name: 'shr-u', op: '>>>', alias: 'bitwise-shift-right-unsigned' },
  ]
  for (const { op, name } of i32Instructions) {
    pushNamedFunc(`i32.${name}`, `(a ${op} b) | 0`)
  }

  const f64ArithInstructions = [
    { name: 'add', op: '+' },
    { name: 'sub', op: '-' },
    { name: 'mul', op: '*' },
    { name: 'div', op: '/' },
  ]
  for (const { op, name } of f64ArithInstructions) {
    pushNamedFunc(`f64.${name}`, `(a ${op} b)`)
  }

  const f64CmpInstructions = [
    { name: 'eq', op: '===' },
    { name: 'ne', op: '!==' },

    { name: 'lt', op: '<' },
    { name: 'gt', op: '>' },
    { name: 'le', op: '<=' },
    { name: 'ge', op: '>=' },
  ]
  for (const { op, name } of f64CmpInstructions) {
    pushNamedFunc(`f64.${name}`, `(a ${op} b) | 0`)
  }

  const unreachable = () => {
    throw new Error('unreachable')
  }
  Object.freeze(unreachable)
  intrinsics.unreachable = unreachable
  Object.freeze(intrinsics)
}

const doFormWord = makeFormWord('do')
const makeDoForm = (forms) => makeFormList(makeList(doFormWord, ...forms))

export const makeEvalForm = (externs, defEnv) => {
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
      const assertTopLevel = () => {
        if (env !== defEnv) throw evalError(`special form '${firstWord}' must be used at the top level`)
      }
      const makeClosureOfKind = (kind) => {
        if (numOfArgs < 3) throw evalError(`special form '${firstWord}' expected at least three arguments`)
        const name = getFormWord(forms[1])
        const parameters = getFormList(forms[2]).map(getFormWord)
        const body = makeDoForm(forms.slice(3))
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
        case 'intrinsic':
          assertNumArgs(1)
          return intrinsics[getFormWord(forms[1])]
        case 'def':
          assertNumArgs(2)
          assertTopLevel()
          defEnv.set(getFormWord(forms[1]), go(env, forms[2]))
          return go(env, forms[2])
        case 'defn':
          assertTopLevel()
          defEnv.set(getFormWord(forms[1]), makeClosureOfKind('func'))
          return langUndefined
        case 'defexpr':
          assertTopLevel()
          defEnv.set(getFormWord(forms[1]), makeClosureOfKind('fexpr'))
          return langUndefined
        case 'defmacro':
          assertTopLevel()
          defEnv.set(getFormWord(forms[1]), makeClosureOfKind('macro'))
          return langUndefined
        // constants calculated from environment
        case 'func':
          return makeClosureOfKind(firstWord)
        case 'atom':
          assertNumArgs(1)
          return atom(go(env, forms[1]))
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
          const { tag, args } = value
          const findMatch = () => {
            for (let i = 2; i < forms.length - 1; i += 2) {
              const patternList = getFormList(forms[i])
              if (patternList.length === 0) throw evalError('pattern must have at least one word')
              if (getFormWord(patternList[0]) !== tag) continue
              if (patternList.length - 1 !== args.length)
                throw evalError(
                  `pattern length ${patternList.length - 1} but value length was ${args.length} ${tag} ${args}`,
                )
              const newEnv = makeEnv(env)
              for (let j = 1; j < patternList.length; j++) setEnv(newEnv, getFormWord(patternList[j]), args[j - 1])
              return { newEnv, body: forms[i + 1] }
            }
            // an odd number of arguments means there is no default case
            if (numOfArgs % 2 !== 0) {
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
          if (numOfArgs < 1) throw evalError('let expected at least a binding list')
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
          form = makeDoForm(forms.slice(2))
          continue
        }
        case 'letfn': {
          if (numOfArgs < 1) throw evalError('letfn expected at least a list of functions')
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
          form = makeDoForm(forms.slice(2))
          continue
        }
        // types
        case 'type': {
          if (numOfArgs % 3 !== 0) throw evalError('type expected triplets')
          assertTopLevel()
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
                    const recordType = getRecordType(record)
                    if (!recordType) throw evalError(`field projecter ${projecterName} not a record ${type}`)
                    if (recordType !== type)
                      throw evalError(`field projecter ${projecterName} on wrong type ${recordType}`)
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
          assertTopLevel()
          const relativeFilePath = getFormWord(forms[1])
          const resolvedPath = getPathRelativeToCurrentDir(defEnv, relativeFilePath)
          const fileForms = readFile(resolvedPath)
          let result = langUndefined
          for (const fileForm of fileForms) result = go(defEnv, fileForm)
          return result
        }
      }
      const func = go(env, firstForm)
      const args = forms.slice(1)
      // closures are also functions so we to check if it is a closure first
      const closureKind = tryGetClosureKind(func)
      if (!closureKind) {
        if (typeof func !== 'function') throw evalError('not a function')
        try {
          return func(...args.map((arg) => go(env, arg)))
        } catch (e) {
          throw evalError('error in function call', e)
        }
      }
      const { paramEnvMaker, body } = func
      switch (closureKind) {
        case 'macro':
          form = go(paramEnvMaker(args), body)
          continue
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
  return (topForm) => go(defEnv, topForm)
}

import { print } from './core.js'

export const catchErrors = (f) => {
  try {
    return f()
  } catch (e) {
    const treeSitterNode = tryGetNodeFromForm(e.form)
    if (treeSitterNode) {
      const contentName = treeSitterNode.tree.contentName
      const { startPosition, endPosition } = treeSitterNode
      const { row, column } = startPosition
      const location = `${contentName}:${row + 1}:${column + 1}`
      console.error('catchErrors node location', e.message, location)
    } else {
      console.error('catchErrors no ', e.message, print(e.form))
    }
    console.log('catchErrors', e.message, e.form, e.innerError ? 'has inner' : '')
    let curErr = e
    while (curErr) {
      console.error(curErr.message, print(curErr.form))
      curErr = curErr.innerError
    }
  }
}
