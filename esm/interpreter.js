import fs from 'fs'
import { isJSReservedWord, createNamedFunction, wrapJSFunction, wrapJSFunctionsToObject } from './utils.js'
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

const paramStringToJS = (p) => (isJSReservedWord(p) ? '_' : '') + p.replace(/-/g, '_')

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

  const varMeta = getHostValue('var-meta')

  const formWord = getHostValue('form-word')
  const formWordWithMeta = getHostValue('form-word-with-meta')
  const formList = getHostValue('form-list')
  const formListWithMeta = getHostValue('form-list-with-meta')

  const defVarWithMeta = getHostValue('def-var-with-meta')
  const setVarValueMeta = getHostValue('set-var-value-meta')
  const varGet = getHostValue('var-get')

  const ctWord = (f) => {
    const w = tryGetFormWord(f)
    if (!w) throw new CompileError('not a word: ' + w + ' ' + typeof w, w)
    return w
  }
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
  const rtCheckCallArity = (f, form) => {
    if (typeof f !== 'function') throw new RuntimeError(`expected function, got ${f}`, form)
    checkCallArity(RuntimeError)(f, form)
  }
  const tryGetAssocList = (assocList, keyString) => {
    for (let i = 0; i < assocList.length - 1; i += 2)
      if (tryGetFormWordValue(assocList[i]) === keyString) return assocList[i + 1]
    return null
  }
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

  const defVars = new Map()
  const insertOrSetDefVar = (nameWord, value, optMetaData) => {
    const nameString = wordValue(nameWord)
    const defVarObject = defVars.get(nameString)
    if (!defVarObject) {
      defVars.set(nameString, defVarWithMeta(nameWord, value, optMetaData))
      return
    }
    console.warn('warning - redefining variable', nameWord)
    // redefing a variable, this can break earlier definitions
    setVarValueMeta(defVarObject, value, optMetaData)
  }
  const compBodies = (ctx, bodies) => {
    const cbodies = bodies.map((body) => compile(ctx, body))
    return (env) => {
      let result = undefined
      for (const cbody of cbodies) result = cbody(env)
      return result
    }
  }
  const compile = (ctx, form) => {
    {
      const varName = tryGetFormWordValue(form)
      if (varName) {
        if (getOuterContextWithVar(ctx, varName)) {
          const evalGetLocalVarValue = (env) => {
            while (env) {
              const { varValues, outer } = env
              if (varValues.has(varName)) return varValues.get(varName)
              env = outer
            }
            throw new RuntimeError(`variable ${varName} not found`, form)
          }
          return evalGetLocalVarValue
        }
        const defVar = defVars.get(varName)
        if (!defVar) throw new CompileError('not found: ' + varName, form)
        const evalGetDefVarValue = () => varGet(defVar)
        return evalGetDefVarValue
      }
    }
    const formList = tryGetFormList(form)
    if (!formList) throw new CompileError('not a form')
    if (formList.length === 0) {
      const evalEmptyForm = () => undefined
      return evalEmptyForm
    }
    const [firstForm, ...args] = formList
    const firstWordValue = tryGetFormWordValue(firstForm)
    const nOfArgs = args.length
    switch (firstWordValue) {
      case 'i32': {
        if (nOfArgs !== 1) throw new CompileError('i32 expects 1 argument', form)
        const wv = +ctWordValue(args[0])
        const normalized = wv | 0
        if (wv !== normalized) throw new CompileError('expected 32-bit signed integer', form)
        const evalI32 = () => normalized
        return evalI32
      }
      case 'word': {
        if (nOfArgs !== 1) throw new CompileError('word expects 1 argument', form)
        const w = tryGetFormWord(args[0])
        if (!w) throw new CompileError('word expects word', form)
        const evalWord = () => w
        return evalWord
      }
      case 'quote': {
        if (nOfArgs !== 1) throw new CompileError('quote expects 1 argument', form)
        const res = args[0]
        const evalQuote = () => res
        return evalQuote
      }
      case 'if': {
        if (nOfArgs < 2 || 3 < nOfArgs) throw new CompileError('if expects 2 or 3 arguments', form)
        const cc = compile(ctx, args[0])
        const ct = compile(ctx, args[1])
        if (nOfArgs === 2) {
          const evalIf2 = (env) => (cc(env) ? ct(env) : undefined)
          return evalIf2
        }
        const cf = compile(ctx, args[2])
        const evalIf3 = (env) => (cc(env) ? ct : cf)(env)
        return evalIf3
      }
      case 'let':
      case 'loop': {
        const [bindingsForm, ...bodies] = args
        const bindings = tryGetFormList(bindingsForm)
        if (!bindings) throw new CompileError('let/loop expects bindings list', form)
        const compBindings = []
        const variables = new Set()
        const newCtx = { variables, outer: ctx, ctxType: firstWordValue }
        for (let i = 0; i < bindings.length - 1; i += 2) {
          const v = ctWordValue(bindings[i])
          compBindings.push([v, compile(newCtx, bindings[i + 1])])
          variables.add(v)
        }
        const mkBindEnv = (env) => {
          const varValues = new Map()
          const inner = { varValues, outer: env }
          for (const [varName, compVal] of compBindings) varValues.set(varName, compVal(inner))
          return inner
        }
        const cbodies = compBodies(newCtx, bodies)
        if (firstWordValue === 'let') {
          const evalLet = (env) => cbodies(mkBindEnv(env))
          return evalLet
        }
        const evalLoop = (env) => {
          const inner = mkBindEnv(env)
          inner.continue = true
          while (inner.continue) {
            inner.continue = false
            const result = cbodies(inner)
            if (!inner.continue) return result
          }
        }
        return evalLoop
      }
      case 'continue': {
        const updateVars = []
        const updateFuncs = []
        for (let i = 0; i < nOfArgs; i += 2) {
          updateVars.push(ctWordValue(args[i]))
          updateFuncs.push(compile(ctx, args[i + 1]))
        }
        const enclosingLoopCtx = getOuterContextOfType(ctx, 'loop')
        if (!enclosingLoopCtx) throw new CompileError('continue outside of loop', form)
        const { variables } = enclosingLoopCtx
        for (const uv of updateVars) {
          if (!variables.has(uv)) throw new CompileError(`loop variable ${uv} not found in loop context`, form)
        }
        const evalContinue = (env) => {
          let enclosingLoopEnv = env
          while (true) {
            if ('continue' in enclosingLoopEnv) break
            enclosingLoopEnv = enclosingLoopEnv.outer
          }
          const { varValues } = enclosingLoopEnv
          // it's important to evaluate all the update functions before updating the variables as they might depend on each other
          const tmpVals = updateFuncs.map((f) => f(env))
          for (let i = 0; i < updateVars.length; i++) varValues.set(updateVars[i], tmpVals[i])
          enclosingLoopEnv.continue = true
        }
        return evalContinue
      }
      case 'func': {
        const [fmname, origParamsForm, ...bodies] = args
        const strFuncName = ctWordValue(fmname)
        const origParamsList = tryGetFormList(origParamsForm)
        const parsedParams = parseParams(origParamsList)
        const params = parsedParams.params.map(ctWordValue)
        const restParam = parsedParams.restParam ? ctWordValue(parsedParams.restParam) : null
        const variables = new Set()
        for (const p of params) variables.add(p)
        if (restParam) variables.add(restParam)
        const nOfParams = params.length
        const newCtx = {
          variables,
          outer: null,
          ctxType: firstWordValue,
          parameters: params,
          restParam,
        }
        const cbodies = compBodies(newCtx, bodies)
        const body = restParam
          ? (...funcArgs) => {
              const varValues = new Map()
              for (let i = 0; i < nOfParams; i++) varValues.set(params[i], funcArgs[i])
              let restArgs
              if (funcArgs.length === nOfParams) {
                restArgs = emptyList
              } else {
                const n = funcArgs.length - nOfParams
                const mutRestArgs = mutableListOfSize(n)
                for (let i = 0; i < n; i++) setArray(mutRestArgs, i, funcArgs[i + nOfParams])
                restArgs = freezeMutableList(mutRestArgs)
              }
              varValues.set(restParam, restArgs)
              return cbodies({ varValues })
            }
          : (...funcArgs) => {
              const varValues = new Map()
              for (let i = 0; i < nOfParams; i++) varValues.set(params[i], funcArgs[i])
              return cbodies({ varValues })
            }
        const jsParameterNames = params.map(paramStringToJS)
        if (restParam) jsParameterNames.push(paramStringToJS('...' + restParam))
        const f = createNamedFunction(strFuncName, jsParameterNames, params, restParam, body)
        // for recursive calls
        newCtx.func = f
        Object.freeze(newCtx)
        const evalFunc = () => f
        return evalFunc
      }
      case 'recur': {
        let funcCtx = getOuterContextOfType(ctx, 'func')
        if (!funcCtx) throw new CompileError('recur outside of func', form)
        ctCheckCallArity(funcCtx, form)
        const cargs = args.map((a) => compile(ctx, a))
        const evalRecur = (env) => funcCtx.func(...cargs.map((carg) => carg(env)))
        return evalRecur
      }
      case 'extern': {
        let ext = externalModules
        for (const a of args) {
          const n = ctWordValue(a)
          if (!(n in ext)) throw new CompileError(`extern ${n} not found`, a)
          ext = ext[n]
        }
        const evalExtern = () => ext
        return evalExtern
      }
      case 'try-get-var': {
        if (nOfArgs !== 1) throw new CompileError('try-get-var expects 1 argument', form)
        const varName = ctWordValue(args[0])
        const evalTryGetVar = () => {
          const v = defVars.get(varName)
          return v ? v : 0
        }
        return evalTryGetVar
      }
      case 'def': {
        if (nOfArgs !== 2) throw new CompileError('def expects 2 arguments', form)
        const [varName, value] = args
        const v = ctWord(varName)
        const cvalue = compile(ctx, value)
        const evalDefine = (env) => insertOrSetDefVar(v, cvalue(env))
        return evalDefine
      }
      case 'def-with-meta': {
        if (nOfArgs !== 3) throw new CompileError('def-with-meta expects 3 arguments', form)
        const [varName, metaForm, value] = args
        const v = ctWord(varName)
        const cmetaData = compile(ctx, metaForm)
        const cvalue = compile(ctx, value)
        const evalDefineWithMeta = (env) => insertOrSetDefVar(v, cvalue(env), cmetaData(env))
        return evalDefineWithMeta
      }
    }
    // direct function call or function in parameter/local variable
    if (!firstWordValue || getOuterContextWithVar(ctx, firstWordValue)) {
      const cfunc = compile(ctx, firstForm)
      const cargs = args.map((a) => compile(ctx, a))
      const evalDirectOrLocalFunctionCall = (env) => {
        const f = cfunc(env)
        rtCheckCallArity(f, form)
        try {
          return f(...cargs.map((carg) => carg(env)))
        } catch (e) {
          throw new RuntimeError(`runtime error when calling function '${firstForm}'`, form, e)
        }
      }
      return evalDirectOrLocalFunctionCall
    }
    const funcDefVar = defVars.get(firstWordValue)
    if (!funcDefVar) throw new CompileError(`function '${firstWordValue}' not found`, form)
    const compileTimeFunc = varGet(funcDefVar)
    ctCheckCallArity(compileTimeFunc, form)
    const varMetaData = varMeta(funcDefVar)
    const metaList = varMetaData ? tryGetFormList(varMetaData) : null
    const funcKindVal = metaList ? tryGetAssocList(metaList, 'function-kind') : null
    const funcKind = funcKindVal ? tryGetFormWordValue(funcKindVal) : null
    switch (funcKind) {
      case 'function':
      case null: {
        const cargs = args.map((a) => compile(ctx, a))
        const evalFunctionCall = (env) => {
          const rtFunc = varGet(funcDefVar)
          rtCheckCallArity(rtFunc, form)
          const eargs = cargs.map((carg) => carg(env))
          try {
            const res = rtFunc(...eargs)
            // if (!isRuntimeValue(res)) throw new RuntimeError(`expected runtime value, got ${res}`, form)
            return res
          } catch (e) {
            throw new RuntimeError(`runtime error when calling function '${firstWordValue}'`, form, e)
          }
        }
        return evalFunctionCall
      }
      case 'macro': {
        // don't eval args and eval result
        let macroResult
        try {
          macroResult = compileTimeFunc(...args)
        } catch (e) {
          if (e instanceof RuntimeError)
            throw new CompileError(`runtime error when calling macro '${firstWordValue}': ${e.message}`, form, e)
          throw e
        }
        const ctAssertIsForm = (f) => {
          if (tryGetFormWord(f)) return
          const l = tryGetFormList(f)
          if (!l) throw new CompileError('expected list', f)
          for (const e of l) ctAssertIsForm(e)
        }
        ctAssertIsForm(macroResult)
        // if (!isTaggedForm(macroResult)) throw new CompileError('macro must return form', form)
        return compile(ctx, macroResult)
      }
      case 'fexpr': {
        // don' eval args and don't eval result
        // thanks Manuel! https://x.com/msimoni/status/1824128031792787808
        const fexprResult = compileTimeFunc(...args)
        const evalFexpr = () => fexprResult
        return evalFexpr
      }
      default:
        throw new CompileError(`invalid function kind '${funcKind}' for '${firstWordValue}'`, form)
    }
  }
  const compileTop = (form) => {
    const compRes = compile(null, form)
    const evaluateCompileResult = () => compRes(null)
    return evaluateCompileResult
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
  const parseFile = (filename) => parseToFormsHost(fs.readFileSync(filename, 'ascii'), filename)
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

const instructions = wrapJSFunctionsToObject(instructionFunctions)

export const makeInitContext = ({ host, converters }) => {
  const make_eval_context = (external_modules) => {
    const { evaluate } = makeInterpreterContext({ externalModules: external_modules, converters })
    const wrappedEvaluate = wrapJSFunction(evaluate)
    // todo maybe return context instead of a function as it will be difficult to pass as a parameter in wasm
    return wrappedEvaluate
  }

  const externalModules = Object.freeze({
    instructions,
    host,
    interpreter: wrapJSFunctionsToObject([make_eval_context]),
  })
  const { compile, evaluate, parseStringToForms, parseFile, parseStringToFirstForm } = makeInterpreterContext({
    externalModules,
    converters,
  })
  const hostListFuncForm = parseStringToFirstForm('[func list [.. entries] entries]')
  const hostListFunc = evaluate(hostListFuncForm)
  const parseFileToList = (filename) => hostListFunc(...parseFile(filename))
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
      return cform(null)
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
      if (v !== undefined) wunsLog(v)
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
    parseFileToList,
    parseStringToFirstForm,
    parseStringToForms,
    evalLogForms,
    parseEvalFiles,
  }
}
