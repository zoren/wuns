import fs from 'fs'
import { parse } from './parseTreeSitter.js'

class RuntimeError extends Error {
  constructor(message, form, innerError) {
    super(message)
    this.form = form
    this.innerError = innerError
  }
}

class CompileError extends Error {
  constructor(message, form, innerError) {
    super(message)
    this.form = form
    this.innerError = innerError
  }
}

const lookupVarContextObject = (ctx, varName) => {
  while (ctx) {
    const { variables } = ctx
    if (variables.has(varName)) return variables.get(varName)
    ctx = ctx.outer
  }
  return null
}

const getOuterContextOfPred = (ctx, pred) => {
  while (ctx) {
    if (pred(ctx)) return ctx
    ctx = ctx.outer
  }
  return null
}

const getOuterContextWithVar = (ctx, varName) => getOuterContextOfPred(ctx, ({ variables }) => variables.has(varName))

const getOuterContextOfType = (ctx, type) => getOuterContextOfPred(ctx, ({ ctxType }) => ctxType === type)

const makeInterpreterContext = ({ externalModules, converters }) => {
  const { host } = externalModules
  if (!host) throw new Error('host module not found')
  const getHostValue = (name) => {
    const v = host[name]
    if (!v) throw new Error(`host value not found: ${name}`)
    return v
  }

  const { wordValue, stringToWord } = converters

  const tryGetFormWord = getHostValue('try-get-form-word')
  const tryGetFormList = getHostValue('try-get-form-list')

  const formWord = getHostValue('form-word')
  const formWordWithMeta = getHostValue('form-word-with-meta')
  const formList = getHostValue('form-list')
  const formListWithMeta = getHostValue('form-list-with-meta')

  const ctWordValue = (f) => {
    const w = tryGetFormWord(f)
    if (!w) throw new CompileError('not a word: ' + w + ' ' + typeof w, w)
    return wordValue(w)
  }

  const tryGetFormWordValue = (f) => {
    const w = tryGetFormWord(f)
    if (!w) return null
    return wordValue(w)
  }

  const parseParams = (params) => {
    if (params.length > 1 && tryGetFormWordValue(params.at(-2)) === '..') {
      const restParam = params.at(-1)
      params = params.slice(0, -2)
      return { params, restParam }
    }
    return { params, restParam: null }
  }

  const checkCallArity =
    (errorFn) =>
    ({ name, parameters, restParam }, form) => {
      const nOfParams = parameters.length
      const formList = tryGetFormList(form)
      if (!formList) throw new errorFn('not a form', form)
      const numOfGivenArgs = formList.length - 1
      if (restParam) {
        if (numOfGivenArgs < nOfParams)
          throw new errorFn(`${name} expected at least ${nOfParams} arguments, got ${numOfGivenArgs}`, form)
      } else {
        if (numOfGivenArgs !== nOfParams)
          throw new errorFn(`${name} expected ${nOfParams} arguments, got ${numOfGivenArgs}`, form)
      }
    }

  const ctCheckCallArity = checkCallArity(CompileError)

  const mutableListOfSize = getHostValue('mutable-list-of-size'),
    setArray = getHostValue('set-array'),
    freezeMutableList = getHostValue('freeze-mutable-list')
  let emptyList = mutableListOfSize(0)
  emptyList = freezeMutableList(emptyList)
  const arrayToHostList = (array) => {
    const l = mutableListOfSize(array.length)
    for (let i = 0; i < array.length; i++) setArray(l, i, array[i])
    return freezeMutableList(l)
  }

  const wunsUnit = undefined
  const evaluateObject = (obj) => {
    switch (obj.op) {
      case 'constant': {
        const { value } = obj
        return () => value
      }
      case 'local-var-get': {
        const { varContextObj } = obj
        const { index } = varContextObj
        return (env) => env[index]
      }
      case 'if': {
        const { condition, then, else: elseBranch } = obj
        const evalCondition = evaluateObject(condition)
        const evalThen = evaluateObject(then)
        const evalElse = evaluateObject(elseBranch)
        return (env) => (evalCondition(env) ? evalThen : evalElse)(env)
      }
      case 'let': {
        const { compBindings, cbodies } = obj
        const evalBindings = compBindings.map(([varObj, compValue]) => [varObj.index, evaluateObject(compValue)])
        const evalBodies = cbodies.map(evaluateObject)
        return (env) => {
          for (const [varIndex, evalValue] of evalBindings) env[varIndex] = evalValue(env)
          let result = wunsUnit
          for (const evalBody of evalBodies) result = evalBody(env)
          return result
        }
      }
      case 'loop': {
        const { compBindings, cbodies } = obj
        const evalBindings = compBindings.map(([varObj, compValue]) => [varObj.index, evaluateObject(compValue)])
        const evalBodies = cbodies.map(evaluateObject)

        const { continueVarObj } = obj
        const continueVarIndex = continueVarObj.index
        return (env) => {
          for (const [varIndex, evalValue] of evalBindings) env[varIndex] = evalValue(env)
          env[continueVarIndex] = 1
          let result = wunsUnit
          while (env[continueVarIndex]) {
            env[continueVarIndex] = 0
            for (const evalBody of evalBodies) result = evalBody(env)
          }
          return result

        }
      }
      case 'continue': {
        const { enclosingLoopCtx, updateBindings } = obj
        const { continueVarObj } = enclosingLoopCtx
        const continueVarIndex = continueVarObj.index
        const evalUpdateBindings = updateBindings.map(([varObj, compValue]) => [
          varObj.index,
          evaluateObject(compValue),
        ])
        return (env) => {
          for (const [varIndex, evalValue] of evalUpdateBindings) env[varIndex] = evalValue(env)
          env[continueVarIndex] = 1
          return wunsUnit
        }
      }
      case 'call': {
        const { func, args } = obj
        const evalFunc = evaluateObject(func)
        const evalArgs = args.map((a) => evaluateObject(a))
        return (env) => {
          const f = evalFunc(env)
          const a = evalArgs.map((ea) => ea(env))
          return f(...a)
        }
      }
      case 'func': {
      }
      case 'recur': {
      }
      default:
        throw new Error('unknown op: ' + obj.op)
    }
  }
  const opConstant = (value) => ({ op: 'constant', value })
  let localVarCount = 0
  const newContext = (ctxType, outer) => {
    return { variables: new Map(), outer, ctxType }
  }
  const compileObject = (ctx, form) => {
    {
      const varName = tryGetFormWordValue(form)
      if (varName) {
        const varContextObj = lookupVarContextObject(ctx, varName)
        if (!varContextObj) throw new CompileError('not found: ' + varName, form)
        return { op: 'local-var-get', varName, varContextObj }
      }
    }
    const formList = tryGetFormList(form)
    if (!formList) throw new CompileError('not a form')
    if (formList.length === 0) return opConstant(wunsUnit)
    const [firstForm, ...args] = formList
    const firstWordValue = tryGetFormWordValue(firstForm)
    const nOfArgs = args.length
    switch (firstWordValue) {
      case 'i32': {
        if (nOfArgs !== 1) throw new CompileError('i32 expects 1 argument', form)
        const wv = +ctWordValue(args[0])
        const normalized = wv | 0
        if (wv !== normalized) throw new CompileError('expected 32-bit signed integer', form)
        return opConstant(normalized)
      }
      case 'word': {
        if (nOfArgs !== 1) throw new CompileError('word expects 1 argument', form)
        const w = tryGetFormWord(args[0])
        if (!w) throw new CompileError('word expects word', form)
        return opConstant(w)
      }
      case 'quote': {
        if (nOfArgs !== 1) throw new CompileError('quote expects 1 argument', form)
        return opConstant(args[0])
      }
      case 'extern': {
        let ext = externalModules
        for (const a of args) {
          const n = ctWordValue(a)
          if (!(n in ext)) throw new CompileError(`extern ${n} not found`, a)
          ext = ext[n]
        }
        // todo could check if ext is a valid runtime value
        return opConstant(ext)
      }
      case 'if': {
        if (nOfArgs < 2 || 3 < nOfArgs) throw new CompileError('if expects 2 or 3 arguments', form)
        const condition = compileObject(ctx, args[0])
        const then = compileObject(ctx, args[1])
        return { op: 'if', condition, then, else: nOfArgs === 2 ? opConstant(wunsUnit) : compileObject(ctx, args[2]) }
      }
      case 'let':
      case 'loop': {
        const [bindingsForm, ...bodies] = args
        const bindings = tryGetFormList(bindingsForm)
        if (!bindings) throw new CompileError('let/loop expects bindings list', form)
        if (bindings.length % 2 !== 0) throw new CompileError('let/loop expects even number of bindings', form)
        const compBindings = []
        const newCtx = newContext(firstWordValue, ctx)
        const { variables } = newCtx
        for (let i = 0; i < bindings.length - 1; i += 2) {
          const varName = ctWordValue(bindings[i])
          const varContextObj = {
            varName,
            index: localVarCount++,
          }
          compBindings.push([varContextObj, compileObject(newCtx, bindings[i + 1])])
          variables.set(varName, varContextObj)
        }
        const cbodies = bodies.map((body) => compileObject(newCtx, body))
        if (firstWordValue === 'let') return { op: 'let', compBindings, cbodies }
        newCtx.cbodies = cbodies
        const continueVarObj = { index: localVarCount++ }
        newCtx.continueVarObj = continueVarObj
        return { op: 'loop', continueVarObj, compBindings, cbodies }
      }
      case 'continue': {
        const enclosingLoopCtx = getOuterContextOfType(ctx, 'loop')
        if (!enclosingLoopCtx) throw new CompileError('continue outside of loop', form)
        const { variables } = enclosingLoopCtx
        const updateBindings = []
        for (let i = 0; i < nOfArgs; i += 2) {
          const uv = ctWordValue(args[i])
          const varObj = variables.get(uv)
          if (!varObj) throw new CompileError(`loop variable ${uv} not found in loop context`, form)
          updateBindings.push([varObj, compileObject(ctx, args[i + 1])])
        }
        return { op: 'continue', enclosingLoopCtx, updateBindings }
      }
      case 'func': {
        const [fmname, origParamsForm, ...bodies] = args
        const origParamsList = tryGetFormList(origParamsForm)
        const parsedParams = parseParams(origParamsList)
        const params = parsedParams.params.map(ctWordValue)
        const restParam = parsedParams.restParam ? ctWordValue(parsedParams.restParam) : null
        const variables = new Map()
        for (const p of params) variables.set(p)
        if (restParam) variables.set(restParam)
        const newCtx = {
          variables,
          outer: null,
          ctxType: firstWordValue,
          parameters: params,
          restParam,
        }
        const cbodies = bodies.map((body) => compileObject(newCtx, body))
        // for recursive calls
        newCtx.cbodies = cbodies
        Object.freeze(newCtx)
        return opConstant(newCtx)
      }
      case 'recur': {
        let funcCtx = getOuterContextOfType(ctx, 'func')
        if (!funcCtx) throw new CompileError('recur outside of func', form)
        ctCheckCallArity(funcCtx, form)
        const cargs = args.map((a) => compile(ctx, a))
        return { op: 'recur', funcCtx, cargs }
      }
    }
    // direct function call or function in parameter/local variable
    if (!firstWordValue || getOuterContextWithVar(ctx, firstWordValue)) {
      const cfunc = compileObject(ctx, firstForm)
      const cargs = args.map((a) => compileObject(ctx, a))
      return { op: 'call', func: cfunc, args: cargs }
    }
    throw new CompileError(`function '${firstWordValue}' not found`, form)
  }
  const compileTop = (form) => {
    localVarCount = 0
    const opObj = compileObject(null, form)
    const numberOfLocalVars = localVarCount
    const evaluateCompileResult = evaluateObject(opObj)
    return () => {
      const env = new Array(numberOfLocalVars)
      return evaluateCompileResult(env)
    }
  }
  const evaluate = (form) => compileTop(form)()
  const stringToForm = (s) => formWord(stringToWord(String(s)))
  function* parseToFormsHost(content, filePath) {
    const filePathWord = filePath ? stringToForm(filePath) : null
    /**
     * @param {TSParser.SyntaxNode} node
     */
    const nodeToForm = (node) => {
      const { type, text, startPosition, isError, namedChildCount } = node
      if (isError) throw new Error('unexpected error node')
      const { row, column } = startPosition
      const metaDataArray = filePathWord ? [filePathWord] : []
      metaDataArray.push(stringToForm(row + 1), stringToForm(stringToForm(column + 1)))
      const metaData = formList(arrayToHostList(metaDataArray))
      switch (type) {
        case 'word':
          return formWordWithMeta(stringToWord(text), metaData)
        case 'list':
          const l = namedChildCount ? arrayToHostList(node.namedChildren.map(nodeToForm)) : emptyList
          return formListWithMeta(l, metaData)
        default:
          throw new Error('unexpected node type: ' + type)
      }
    }
    for (const child of parse(content).rootNode.namedChildren) yield nodeToForm(child)
  }
  const parseStringToForms = (content) => parseToFormsHost(content)
  const parseStringToFirstForm = (content) => {
    for (const form of parseToFormsHost(content)) return form
    throw new Error('no forms found')
  }
  const parseFile = (filePath) => parseToFormsHost(fs.readFileSync(filePath, 'ascii'), filePath)
  return { compile: compileTop, evaluate, parseStringToForms, parseFile, parseStringToFirstForm }
}

export const runCform = (exp) => {
  const getFormLocation = (subForm) => meta(subForm)
  try {
    return exp()
  } catch (e) {
    if (e instanceof RuntimeError) {
      console.error(`runtime error in ${getFormLocation(e.form)}: ${e.message}`)
    } else if (e instanceof CompileError) {
      console.error(`compiletime error in ${getFormLocation(e.form)}: ${e.message}`)
    } else throw e
  }
}

import { instructionFunctions } from './instructions.js'

const instructions = Object.fromEntries(instructionFunctions.map((f) => [f.name, f]))

export const makeInitContext = ({ host, converters }) => {
  // const make_eval_context = (external_modules) => {
  //   const { evaluate } = makeInterpreterContext({ externalModules: external_modules, converters })
  //   const wrappedEvaluate = wrapJSFunction(evaluate)
  //   // todo maybe return context instead of a function as it will be difficult to pass as a parameter in wasm
  //   return wrappedEvaluate
  // }

  const externalModules = Object.freeze({
    instructions,
    host,
    // interpreter: wrapJSFunctionsToObject([make_eval_context]),
  })
  const { compile, evaluate, parseStringToForms, parseFile, parseStringToFirstForm } = makeInterpreterContext({
    externalModules,
    converters,
  })
  // const hostListFuncForm = parseStringToFirstForm('[func list [.. entries] entries]')
  // const hostListFunc = evaluate(hostListFuncForm)
  // const parseFileToList = (filename) => hostListFunc(...parseFile(filename))
  const meta = host.meta
  const wunsLog = host.log
  const getFormLocation = (subForm) => {
    if (subForm) {
      wunsLog(meta(subForm))
    } else console.log('no meta')
  }

  const logInnerErrors = (e) => {
    let currentError = e.innerError
    while (currentError) {
      const { form, message } = currentError
      console.error(`inner error in ${getFormLocation(form)}: ${message}`)
      currentError = currentError.innerError
    }
  }
  const compEvalLog = (form) => {
    const cform = (() => {
      try {
        return compile(form)
      } catch (e) {
        if (e instanceof CompileError) {
          console.error(`compile error in ${getFormLocation(e.form || form)}: ${e.message}`)
          console.error(e)
        } else {
          console.error(`unexpected non-compile error: ${e.message}`)
        }
        logInnerErrors(e)
        throw e
      }
    })()
    try {
      return cform([])
    } catch (e) {
      if (e instanceof RuntimeError) {
        console.error(`runtime error in ${getFormLocation(e.form || form)}: ${e.message}`)
      } else {
        console.error(`unexpected non-runtime error: ${e.message}`)
      }
      logInnerErrors(e)
      throw e
    }
  }
  const evalLogForms = (forms) => {
    for (const form of forms) {
      const v = compEvalLog(form)
      wunsLog(v)
    }
  }
  const parseEvalFiles = (filenames) => {
    for (const filename of filenames) {
      for (const form of parseFile(filename)) {
        compEvalLog(form)
      }
    }
  }
  return {
    evaluate,
    parseStringToFirstForm,
    parseStringToForms,
    evalLogForms,
    parseEvalFiles,
  }
}

// import fs from 'node:fs'
import * as readline from 'node:readline'
import { stdin, nextTick, stdout } from 'node:process'
// import { makeHost } from './host-simulated-mem.js'
import { jsHost } from './host-js.js'

const host = jsHost
// const host = makeHost()

const { parseEvalFiles, parseStringToForms, evalLogForms } = makeInitContext(host)
const commandLineArgs = process.argv.slice(2)

parseEvalFiles(commandLineArgs)

const historyFilePath = 'history.json'

let history = []
try {
  const histO = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'))
  history = histO.history
} catch (err) {
  if (err.code !== 'ENOENT') throw err
}

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
  terminal: true,
  historySize: 1024,
  history,
  removeHistoryDuplicates: true,
  tabSize: 2,
})

rl.on('history', (history) => {
  const historyObject = { history, date: new Date().toISOString() }
  fs.writeFileSync(historyFilePath, JSON.stringify(historyObject))
})

const prompt = () => {
  rl.question(`wuns> `, (line) => {
    if (line === '') {
      console.log(`Bye!`)
      rl.close()
      return
    }
    try {
      evalLogForms(parseStringToForms(line))
    } catch (err) {
      console.error(err)
    }
    nextTick(prompt)
  })
}

prompt()
