import { setJSFunctionName } from './utils.js'

const makeEnv = (outer) => {
  if (!(outer instanceof Map)) throw new Error('makeEnv expects a Map')
  const env = new Map()
  env.outer = outer
  return env
}
const setEnv = (env, varName, value) => {
  env.set(varName, value)
}

import {
  getRecordType,
  isTaggedValue,
  langUndefined,
  makeList,
  makeRecordFromObj,
  makeValueTagger,
  parseString,
  tryGetFormList,
  tryGetFormWord,
  makeClosure,
  tryGetClosureKind,
  makeFormWord,
  makeFormList,
} from './core.js'
import { 'read-file-async' as read_file_async } from './runtime-lib/files.js'
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

import { intrinsics } from './intrinsics.js'

const doFormWord = makeFormWord('do')
const makeDoForm = (forms) => makeFormList(makeList(doFormWord, ...forms))

export const makeEvalForm = () => {
  const defEnv = new Map()

  const makeClosureOfKind = (kind, forms, env) => {
    if (forms.length < 3)
      throw new EvalError(`special form '${getFormWord(forms[0])}' expected at least three arguments`)
    const name = getFormWord(forms[1])
    const parameters = getFormList(forms[2]).map(getFormWord)
    const body = makeDoForm(forms.slice(3))
    let closure
    const paramEnvMaker = (() => {
      if (parameters.length < 2 || parameters.at(-2) !== '..') {
        const arity = parameters.length
        return (eargs) => {
          const paramEnv = makeEnv(env)
          paramEnv.isClosureEnv = true
          setEnv(paramEnv, name, closure)
          if (eargs.length !== arity) throw new EvalError(`${name} expected ${arity} arguments, got ${eargs.length}`)
          for (let i = 0; i < arity; i++) setEnv(paramEnv, parameters[i], eargs[i])
          return paramEnv
        }
      }
      const restParam = parameters.at(-1)
      const regularParameters = parameters.slice(0, -2)
      const arity = regularParameters.length
      return (eargs) => {
        const paramEnv = makeEnv(env)
        paramEnv.isClosureEnv = true
        setEnv(paramEnv, name, closure)
        if (eargs.length < arity)
          throw new EvalError(`${name} expected at least ${arity} arguments, got ${eargs.length}`)
        for (let i = 0; i < arity; i++) setEnv(paramEnv, regularParameters[i], eargs[i])
        setEnv(paramEnv, restParam, makeList(...eargs.slice(arity)))
        return paramEnv
      }
    })()
    const f = (...args) => goExp(paramEnvMaker(args), body)
    setJSFunctionName(f, name)
    closure = makeClosure(f, kind, paramEnvMaker, body)
    return closure
  }

  const goExp = (env, form) => {
    const evalError = (message, innerError) => new EvalError(message, form, innerError)
    while (true) {
      const word = tryGetFormWord(form)
      if (word) {
        let curEnv = env
        while (curEnv) {
          if (curEnv.has(word)) return curEnv.get(word)
          curEnv = curEnv.outer
        }
        throw evalError('undefined variable')
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
        case 'intrinsic': {
          if (numOfArgs < 1) throw evalError('intrinsic expected at least one argument')
          const f = intrinsics[getFormWord(forms[1])]
          if (!f) throw evalError('undefined intrinsic')
          return f(...forms.slice(2).map((arg) => goExp(env, arg)))
        }
        // constants calculated from environment
        case 'func':
          return makeClosureOfKind(firstWord, forms, env)
        // control flow
        case 'if':
          assertNumArgs(3)
          try {
            form = forms[goExp(env, forms[1]) !== 0 ? 2 : 3]
          } catch (e) {
            throw evalError('error in if condition', e)
          }
          continue
        case 'switch': {
          if (numOfArgs < 2) throw evalError(`special form 'switch' expected at least two arguments`)
          if (numOfArgs % 2 !== 0) throw evalError('no switch default found')
          const value = goExp(env, forms[1])
          form = forms.at(-1)
          for (let i = 2; i < forms.length - 1; i += 2) {
            if (getFormList(forms[i]).some((patForm) => goExp(env, patForm) === value)) {
              form = forms[i + 1]
              break
            }
          }
          continue
        }
        case 'match': {
          if (numOfArgs === 0) throw evalError(`special form '${firstWord}' expected at least one argument`)
          const value = goExp(env, forms[1])
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
            if (numOfArgs % 2 !== 0) throw evalError('no match found')
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
            for (let i = 1; i < forms.length - 1; i++) goExp(env, forms[i])
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
              setEnv(newEnv, getFormWord(bindings[i]), goExp(newEnv, bindings[i + 1]))
          } catch (e) {
            throw evalError('error in let bindings', e)
          }
          env = newEnv
          form = makeDoForm(forms.slice(2))
          continue
        }
        case 'loop': {
          if (numOfArgs < 1) throw evalError('loop expected at least a binding list')
          const bindings = getFormList(forms[1])
          if (bindings.length % 2 !== 0) throw evalError('odd number of bindings')
          const loopBodyForm = makeDoForm(forms.slice(2))
          const loopEnv = makeEnv(env)
          loopEnv.loopBody = loopBodyForm
          try {
            for (let i = 0; i < bindings.length - 1; i += 2) {
              const variableName = getFormWord(bindings[i])
              setEnv(loopEnv, variableName, goExp(loopEnv, bindings[i + 1]))
            }
          } catch (e) {
            throw evalError('error in loop bindings', e)
          }
          env = loopEnv
          form = loopBodyForm
          continue
        }
        case 'continue': {
          let loopEnv = env
          while (loopEnv) {
            if (loopEnv.loopBody) break
            if (loopEnv.isClosureEnv) throw evalError('continue not in loop')
            const { outer } = loopEnv
            loopEnv = outer
          }
          if (!loopEnv) throw evalError('continue not in loop')
          for (let i = 1; i < forms.length; i += 2) {
            const variableForm = forms[i]
            const variableName = getFormWord(variableForm)
            if (!loopEnv.has(variableName)) throw new EvalError('continue, not a loop variable', variableForm)
            setEnv(loopEnv, variableName, goExp(env, forms[i + 1]))
          }
          env = loopEnv
          form = loopEnv.loopBody
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
            for (const func of funcs) values.push(goExp(newEnv, func.funcForm))
            for (let i = 0; i < funcs.length; i++) setEnv(newEnv, funcs[i].name, values[i])
          } catch (e) {
            throw evalError('error in let bindings', e)
          }
          env = newEnv
          form = makeDoForm(forms.slice(2))
          continue
        }
        case 'type-anno':
          assertNumArgs(2)
          form = forms[1]
          continue
      }
      const func = goExp(env, firstForm)
      const args = forms.slice(1)
      // closures are also functions so we to check if it is a closure first
      const closureKind = tryGetClosureKind(func)
      if (!closureKind) {
        if (typeof func !== 'function') throw evalError('not a function')
        try {
          return func(...args.map((arg) => goExp(env, arg)))
        } catch (e) {
          throw evalError('error in function call', e)
        }
      }
      const { paramEnvMaker, body } = func
      switch (closureKind) {
        case 'macro':
          form = goExp(paramEnvMaker(args), body)
          continue
        case 'fexpr':
          env = paramEnvMaker(args)
          form = body
          continue
        case 'func':
          env = paramEnvMaker(args.map((arg) => goExp(env, arg)))
          form = body
          continue
        default:
          throw evalError('unexpected closure kind: ' + kind + ' ' + func)
      }
    }
  }
  const evalExp = (form) => goExp(defEnv, form)
  const evalTop = async (form) => {
    const evalError = (message, innerError) => new EvalError(message, form, innerError)
    const setDef = (name, value) => {
      if (defEnv.has(name)) throw evalError('redefining variable')
      defEnv.set(name, value)
    }
    const forms = tryGetFormList(form)
    if (forms && forms.length) {
      const [firstForm] = forms
      const numOfArgs = forms.length - 1

      const firstWord = tryGetFormWord(firstForm)
      switch (firstWord) {
        case 'def':
          setDef(getFormWord(forms[1]), evalExp(forms[2]))
          return langUndefined
        case 'defn':
          setDef(getFormWord(forms[1]), makeClosureOfKind('func', forms, defEnv))
          return langUndefined
        case 'defexpr':
          setDef(getFormWord(forms[1]), makeClosureOfKind('fexpr', forms, defEnv))
          return langUndefined
        case 'defmacro':
          setDef(getFormWord(forms[1]), makeClosureOfKind('macro', forms, defEnv))
          return langUndefined
        case 'do':
          try {
            for (let i = 1; i < forms.length; i++) await evalTop(forms[i])
          } catch (e) {
            throw evalError('error in do', e)
          }
          return langUndefined
        case 'load': {
          if (forms.length !== 2) throw evalError('load expects one argument')
          const relativeFilePath = getFormWord(forms[1])
          const fileContent = await read_file_async(relativeFilePath)
          const fileForms = parseString(fileContent, relativeFilePath)
          for (const fileForm of fileForms) await evalTop(fileForm)
          return langUndefined
        }
        // types
        case 'type': {
          if (numOfArgs % 3 !== 0) throw evalError('type expected triplets')
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
                  setDef(qualName, tagger)
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
                  setDef(projecterName, projecter)
                }
                const constructor = (...args) => {
                  if (args.length !== fieldNames.length) throw evalError('wrong number of arguments to ' + type)
                  const fieldObj = {}
                  for (let i = 0; i < fieldNames.length; i++) fieldObj[fieldNames[i]] = args[i]
                  return makeRecordFromObj(type, fieldObj)
                }
                setDef(type, constructor)
                break
              }
              default:
                throw evalError('unexpected type body: ' + firstBodyWord)
            }
          }
          return langUndefined
        }
        case 'import': {
          if (forms.length !== 4) throw evalError('import expects three arguments')
          const importModuleName = getFormWord(forms[1])
          const module = await import(`./runtime-lib/${importModuleName}.js`)
          const importElementName = getFormWord(forms[2])
          const importedValue = module[importElementName]
          if (importedValue === undefined)
            throw evalError('imported value not found in module ' + importModuleName + ' ' + importElementName)
          setDef(importElementName, importedValue)
          return langUndefined
        }
        case 'export':
          for (let i = 1; i < forms.length; i++) {
            const exportWord = getFormWord(forms[i])
            if (!defEnv.has(exportWord)) throw evalError('exported def variable not found: ' + exportWord)
          }
          return langUndefined
      }
      // if (!defEnv.has(firstWord)) throw evalError('undefined variable')
      const func = defEnv.get(firstWord)
      const closureKind = tryGetClosureKind(func)
      if (closureKind === 'macro') {
        const { paramEnvMaker, body } = func
        const macroResult = goExp(paramEnvMaker(forms.slice(1)), body)
        return evalTop(macroResult)
      }
    }
    return evalExp(form)
  }
  const evalTops = async (forms) => {
    let optExp = null
    for (const form of forms) optExp = await evalTop(form)
    return optExp
  }
  const tryGetMacro = (name) => {
    if (typeof name !== 'string') throw new Error('try-get-macro expects string')
    const value = defEnv.get(name)
    if (tryGetClosureKind(value) === 'macro') return value
    return null
  }
  return {
    evalExp,
    evalTop,
    evalTops,
    tryGetMacro,
    getDefNames: () => defEnv.keys(),
    getDef: (name) => defEnv.get(name),
  }
}
