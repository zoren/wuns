import fs from 'fs'
import { setJSFunctionName, parseFunctionParameters, createParameterNamesWrapper } from './utils.js'
import { setMeta, defVar } from './core.js'
import { instructionFunctions } from './instructions.js'
import { isJSReservedWord } from './utils.js'
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

const createNamedFunction = (name, jsParameterNames, wunsParameterNames, wunsRestParameter, body) => {
  const f = createParameterNamesWrapper(jsParameterNames)(body)
  setJSFunctionName(f, name)
  f.parameters = wunsParameterNames
  if (wunsRestParameter) f.restParam = wunsRestParameter
  return Object.freeze(f)
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

  const meta = getHostValue('meta')

  const formWord = getHostValue('form-word')
  const formList = getHostValue('form-list')

  const transientKVMap = getHostValue('transient-kv-map')
  const setKVMap = getHostValue('set-kv-map')
  const freezeKVMap = getHostValue('freeze-kv-map')

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
  const emptyList = mutableListOfSize(0)
  freezeMutableList(emptyList)

  const defVars = new Map()
  const insertOrSetDefVar = (name, value, optMetaData) => {
    let defVarObject = defVars.get(name)
    if (defVarObject) {
      defVarObject.setValue(value)
    } else {
      defVarObject = defVar(name, value)
      defVars.set(name, defVarObject)
    }
    setMeta(defVarObject, optMetaData)
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
        if (getOuterContextWithVar(ctx, varName))
          return (env) => {
            while (env) {
              const { varValues, outer } = env
              if (varValues.has(varName)) return varValues.get(varName)
              env = outer
            }
            throw new RuntimeError(`variable ${varName} not found`, form)
          }
        const defVar = defVars.get(varName)
        if (!defVar) throw new CompileError('not found: ' + varName, form)
        return () => defVar.value
      }
    }
    const formList = tryGetFormList(form)
    if (!formList) throw new CompileError('not a form', form)
    if (formList.length === 0) return () => undefined
    const [firstForm, ...args] = formList
    const firstWordValue = tryGetFormWordValue(firstForm)
    switch (firstWordValue) {
      case 'i32': {
        if (args.length !== 1) throw new CompileError('i32 expects 1 argument', form)
        const wv = +ctWordValue(args[0])
        const normalized = wv | 0
        if (wv !== normalized) throw new CompileError('expected 32-bit signed integer', form)
        return () => normalized
      }
      case 'word': {
        if (args.length !== 1) throw new CompileError('word expects 1 argument', form)
        const w = tryGetFormWord(args[0])
        if (!w) throw new CompileError('word expects word', form)
        return () => w
      }
      case 'quote': {
        if (args.length !== 1) throw new CompileError('quote expects 1 argument', form)
        const res = args[0]
        return () => res
      }
      case 'if': {
        if (args.length < 2 || 3 < args.length) throw new CompileError('if expects 2 or 3 arguments', form)
        const cc = compile(ctx, args[0])
        const ct = compile(ctx, args[1])
        if (args.length === 2) return (env) => (cc(env) ? ct(env) : undefined)
        const cf = compile(ctx, args[2])
        return (env) => (cc(env) ? ct : cf)(env)
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
        if (firstWordValue === 'let') return (env) => cbodies(mkBindEnv(env))
        return (env) => {
          const inner = mkBindEnv(env)
          inner.continue = true
          while (inner.continue) {
            inner.continue = false
            const result = cbodies(inner)
            if (!inner.continue) return result
          }
        }
      }
      case 'continue': {
        const updateVars = []
        const updateFuncs = []
        for (let i = 0; i < args.length; i += 2) {
          updateVars.push(ctWordValue(args[i]))
          updateFuncs.push(compile(ctx, args[i + 1]))
        }
        const enclosingLoopCtx = getOuterContextOfType(ctx, 'loop')
        if (!enclosingLoopCtx) throw new CompileError('continue outside of loop', form)
        const { variables } = enclosingLoopCtx
        for (const uv of updateVars) {
          if (!variables.has(uv)) throw new CompileError(`loop variable ${uv} not found in loop context`, form)
        }
        return (env) => {
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
          ? (...args) => {
              const varValues = new Map()
              for (let i = 0; i < nOfParams; i++) varValues.set(params[i], args[i])
              let restArgs
              if (args.length === nOfParams) {
                restArgs = emptyList
              } else {
                const n = args.length - nOfParams
                restArgs = mutableListOfSize(n)
                for (let i = 0; i < n; i++) setArray(restArgs, i, args[i + nOfParams])
                freezeMutableList(restArgs)
              }
              varValues.set(restParam, restArgs)
              return cbodies({ varValues })
            }
          : (...args) => {
              const varValues = new Map()
              for (let i = 0; i < nOfParams; i++) varValues.set(params[i], args[i])
              return cbodies({ varValues })
            }
        const jsParameterNames = params.map(paramStringToJS)
        if (restParam) jsParameterNames.push(paramStringToJS('...' + restParam))
        const f = createNamedFunction(strFuncName, jsParameterNames, params, restParam, body)
        // for recursive calls
        newCtx.func = f
        Object.freeze(newCtx)
        return () => f
      }
      case 'recur': {
        let funcCtx = getOuterContextOfType(ctx, 'func')
        if (!funcCtx) throw new CompileError('recur outside of func', form)
        ctCheckCallArity(funcCtx, form)
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => funcCtx.func(...cargs.map((carg) => carg(env)))
      }
      case 'extern': {
        let ext = externalModules
        for (const a of args) {
          const n = ctWordValue(a)
          if (!(n in ext)) throw new CompileError(`extern ${n} not found`, a)
          ext = ext[n]
        }
        return () => ext
      }
      case 'try-get-var': {
        if (args.length !== 1) throw new CompileError('try-get-var expects 1 argument', form)
        const varName = ctWordValue(args[0])
        return () => {
          const v = defVars.get(varName)
          if (v) return v
          return 0
        }
      }
      case 'def': {
        if (args.length !== 2) throw new CompileError('def expects 2 arguments', form)
        const [varName, value] = args
        const v = ctWordValue(varName)
        const cvalue = compile(ctx, value)
        return (env) => insertOrSetDefVar(v, cvalue(env))
      }
      case 'def-with-meta': {
        if (args.length !== 3) throw new CompileError('def-with-meta expects 3 arguments', form)
        const [varName, metaForm, value] = args
        const v = ctWordValue(varName)
        const cmetaData = compile(ctx, metaForm)
        const cvalue = compile(ctx, value)
        return (env) => insertOrSetDefVar(v, cvalue(env), cmetaData(env))
      }
    }
    // direct function call or function in parameter/local variable
    if (!firstWordValue || getOuterContextWithVar(ctx, firstWordValue)) {
      const cfunc = compile(ctx, firstForm)
      const cargs = args.map((a) => compile(ctx, a))
      return (env) => {
        const f = cfunc(env)
        rtCheckCallArity(f, form)
        return f(...cargs.map((carg) => carg(env)))
      }
    }
    const funcDefVar = defVars.get(firstWordValue)
    if (!funcDefVar) throw new CompileError(`function '${firstWordValue}' not found`, form)
    const compileTimeFunc = funcDefVar.value
    ctCheckCallArity(compileTimeFunc, form)
    const varMeta = meta(funcDefVar)
    const metaList = tryGetFormList(varMeta)
    const funcKindVal = metaList ? tryGetAssocList(metaList, 'function-kind') : null
    const funcKind = tryGetFormWordValue(funcKindVal)
    switch (funcKind) {
      case 'function':
      case null: {
        const cargs = args.map((a) => compile(ctx, a))
        return (env) => {
          const rtFunc = funcDefVar.value
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
        return () => fexprResult
      }
      default:
        throw new CompileError(`unreachable, invalid function kind '${funcKind}' for '${firstWordValue}'`, form)
    }
  }
  const compileTop = (form) => {
    const compRes = compile(null, form)
    const evaluateCompileResult = () => compRes(null)
    return evaluateCompileResult
  }
  const evaluate = (form) => compileTop(form)()

  function* treeToFormsHost(tree, filePath) {
    // const filePathWord = filePath ? stringToWord(filePath) : null
    // const filePathKey = stringToWord('file-path')
    // const rowWord = stringToWord('row')
    // const columnWord = stringToWord('column')
    /**
     * @param {TSParser.SyntaxNode} node
     */
    const nodeToForm = (node) => {
      const { type, text, startPosition, isError, namedChildCount } = node
      if (isError) throw new Error('unexpected error node')
      // const { row, column } = startPosition
      // const metaData = transientKVMap()
      // if (filePathWord) setKVMap(metaData, filePathKey, filePathWord)
      // setKVMap(metaData, rowWord, row + 1)
      // setKVMap(metaData, columnWord, column + 1)
      // freezeKVMap(metaData)
      switch (type) {
        case 'word':
          return formWord(stringToWord(text))
        case 'list':
          let l
          if (namedChildCount) {
            l = mutableListOfSize(namedChildCount)
            for (let i = 0; i < namedChildCount; i++) setArray(l, i, nodeToForm(node.namedChild(i)))
            freezeMutableList(l)
          } else {
            l = emptyList
          }
          return formList(l)
        default:
          throw new Error('unexpected node type: ' + type)
      }
    }
    for (const child of tree.rootNode.namedChildren) yield nodeToForm(child)
  }
  const parseStringToForms = (content) => treeToFormsHost(parse(content))
  const parseStringToFirstForm = (content) => {
    for (const form of treeToFormsHost(parse(content))) return form
    throw new Error('no forms found')
  }
  const parseFile = (filename) => treeToFormsHost(parse(fs.readFileSync(filename, 'ascii')), filename)
  return { compile: compileTop, evaluate, parseStringToForms, parseFile, parseStringToFirstForm }
}

const underscoreToDash = (s) => s.replace(/_/g, '-')

const wrapJSFunction = (importFunc) => {
  const dashedName = underscoreToDash(importFunc.name)
  const jsParameterNames = parseFunctionParameters(importFunc)
  let wunsParameterNames = null
  let wunsRestParam = null
  if (jsParameterNames.length && jsParameterNames.at(-1).startsWith('...')) {
    wunsParameterNames = jsParameterNames.slice(0, -1)
    wunsRestParam = underscoreToDash(jsParameterNames.at(-1).slice(3))
  } else {
    wunsParameterNames = [...jsParameterNames]
  }
  return createNamedFunction(
    dashedName,
    jsParameterNames,
    wunsParameterNames.map(underscoreToDash),
    wunsRestParam,
    importFunc,
  )
}

import { print, meta } from './core.js'

const getFormLocation = (subForm) => (subForm ? meta(subForm).location : undefined) || 'unknown location'

export const runCform = (exp) => {
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

const compEvalLog = (compile, form) => {
  const cform = (() => {
    try {
      return compile(form)
    } catch (e) {
      if (e instanceof CompileError) {
        console.error(`compile error in ${getFormLocation(e.form || form)}: ${e.message}`)
        console.error(e)
      } else {
        console.error(`unexpected non-compile error: ${e.message}`)
        let innerError = e.innerError
        while (innerError) {
          console.error(`inner error in ${getFormLocation(innerError.form)}: ${innerError.message}`)
          innerError = innerError.innerError
        }
      }
      throw e
    }
  })()
  try {
    return cform(null)
  } catch (e) {
    if (e instanceof RuntimeError) {
      console.error(`runtime error in ${getFormLocation(e.form || form)}: ${e.message}`)
      // console.error(e)
      let innerError = e.innerError
      while (innerError) {
        console.error(`inner error in ${getFormLocation(innerError.form)}: ${innerError.message}`)
        innerError = innerError.innerError
      }
    } else {
      console.error(`unexpected non-runtime error: ${e.message}`)
    }
    throw e
  }
}

const wrapJSFunctionsToObject = (funcs) => {
  const newObject = {}
  for (const importFunc of funcs) {
    const func = wrapJSFunction(importFunc)
    newObject[func.name] = func
  }
  return Object.freeze(newObject)
}

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
  return {
    evaluate,
    parseFileToList,
    parseStringToFirstForm,
    parseStringToForms,
    evalLogForms: (forms) => {
      for (const form of forms) {
        const v = compEvalLog(compile, form)
        if (v !== undefined) console.log(print(v))
      }
    },
    parseEvalFiles: (filenames) => {
      for (const filename of filenames) {
        for (const form of parseFile(filename)) {
          compEvalLog(compile, form)
        }
      }
    },
  }
}

import { wordValue, stringToWord } from './core.js'

export const jsHost = {
  host: wrapJSFunctionsToObject(Object.values(await import('./host.js'))),
  converters: { wordValue, stringToWord },
}
