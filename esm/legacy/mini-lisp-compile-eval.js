class CompiledClosure {
  constructor(env, func) {
    this.env = env
    this.func = func
  }
}

const makeCompiledClosure = (env, func) => Object.freeze(new CompiledClosure(env, func))

const defCtx = new Map()
const list = (...args) => Object.freeze(args)

const evalOp = (env, obj) => {
  while (true) {
    const { type } = obj
    switch (type) {
      case 'constant':
        return obj.value
      case 'local-var':
        return env[obj.index]
      case 'closure':
        return makeCompiledClosure(env, obj.func)

      case 'if':
        obj = evalOp(env, obj.condition) ? obj.then : obj.else
        continue
      case 'do': {
        const { ops } = obj
        for (let i = 0; i < ops.length - 1; i++) evalOp(env, ops[i])
        obj = ops.at(-1)
        continue
      }
      case 'let': {
        for (const { localIndex, value } of obj.bindings) env[localIndex] = evalOp(newEnv, value)
        obj = obj.body
        continue
      }
      case 'call': {
        const { callKind, func, args } = obj
        let { name, parameters, restParam, body } = func
        const setParams = (paramEnv, args) => {
          const nOfParams = parameters.length
          for (let i = 0; i < nOfParams; i++) paramEnv[i] = args[i]
          if (restParam) paramEnv[nOfParams] = list(...args.slice(nOfParams))
        }
        switch (callKind) {
          case 'tail-rec':
            // reuse env
            setParams(
              env,
              args.map((arg) => evalOp(env, arg)),
            )
            obj = body
            continue
          case 'tail': {
            const newParamEnv = makeEnv(env)
            setParams(
              newParamEnv,
              args.map((arg) => evalOp(env, arg)),
            )
            env = newParamEnv
            obj = body
            continue
          }
          case 'constant-func': {
            const cfunc = evalOp(env, func)
            if (typeof cfunc !== 'function') throw evalError('not a function', func)
            const eargs = args.map((arg) => evalOp(env, arg))
            return cfunc(...eargs)
          }
          case 'direct':
            const func = evalOp(env, func)
            const eargs = args.map((arg) => evalOp(env, arg))
            if (typeof func === 'function') return func(...eargs)
            if (!(func instanceof CompiledClosure)) throw new EvalError('not a function', func)

            const { func: closureFunc, env: closureEnv } = func
            // check arity of call here
            const nOfGivenArgs = args.length
            const nOfParams = closureFunc.parameters.length
            if (restParam) {
              if (nOfGivenArgs < nOfParams)
                throw new EvalError(`${name} expected at least ${nOfParams} arguments, got ${nOfGivenArgs}`)
            } else {
              if (nOfGivenArgs !== nOfParams)
                throw new EvalError(`${name} expected ${nOfParams} arguments, got ${nOfGivenArgs}`)
            }
            for (let i = 0; i < nOfParams; i++) paramEnv[i] = args[i]
            env = setParams(closureFunc, eargs)
            obj = closureFunc.body
            return evalOp(env, closureFunc.body)
        }
      }
    }
  }
}

import { isForm, tryGetFormWord, tryGetFormList } from '../core.js'

const makeCtx = (outer) => {
  const ctx = new Map()
  ctx.outer = outer
  return ctx
}

class CompileError extends Error {
  constructor(message, form, innerError) {
    super(message)
    this.form = form
    this.innerError = innerError
  }
}

const compileTop = (form) => {
  let localVarCount = 0
  const getLocalVar = () => localVarCount++
  const setNewCtxVar = (ctx, varName) => {
    ctx.set(varName, getLocalVar())
  }
  const getFormWord = (form) => {
    const word = tryGetFormWord(form)
    if (word) return word
    throw new CompileError('expected word', form)
  }
  const getFormList = (form) => {
    const list = tryGetFormList(form)
    if (list) return list
    throw new CompileError('expected list', form)
  }
  const compile = (ctx, form) => {
    const compileError = (message, innerError) => new CompileError(message, form, innerError)
    const word = tryGetFormWord(form)
    if (word) {
      let curCtx = ctx
      while (curCtx) {
        if (curCtx.has(word)) return { type: 'local-var', index: curCtx.get(word) }
        curCtx = curCtx.outer
      }
      if (!defCtx.has(word)) throw compileError('undefined variable: ' + word)
      return defCtx.get(word)
    }
    const forms = getFormList(form)
    if (forms.length === 0) throw compileError('empty list')
    const [firstForm] = forms
    const firstWord = tryGetFormWord(firstForm)
    const numOfArgs = forms.length - 1
    const assertNumArgs = (num) => {
      if (numOfArgs !== num)
        throw compileError(`special form '${firstWord}' expected ${num} arguments, got ${numOfArgs}`)
    }
    switch (firstWord) {
      case 'i32':
        assertNumArgs(1)
        const normalized = +getFormWord(forms[1]) | 0
        return { type: 'constant', kind: firstWord, value: normalized }
      case 'word':
        assertNumArgs(1)
        const word = getFormWord(forms[1])
        return { type: 'constant', kind: firstWord, value: word }
      case 'quote': {
        assertNumArgs(1)
        const form = forms[1]
        assertFormDeep(form)
        return { type: 'constant', kind: firstWord, value: form }
      }
      case 'func':
      case 'fexpr':
      case 'macro': {
        assertNumArgs(3)
        const name = getFormWord(forms[1])
        let parameters = getFormList(forms[2]).map(getFormWord)
        const newCtx = makeCtx(ctx)
        newCtx.funcName = name
        let restParam = null
        if (parameters.length > 1 && parameters.at(-2) === '..') {
          restParam = parameters.at(-1)
          parameters = parameters.slice(0, -2)
          parameters.forEach((param) => setNewCtxVar(newCtx, param))
          setNewCtxVar(ctx, restParam)
        } else {
          parameters.forEach((param) => setNewCtxVar(newCtx, param))
        }
        const body = compile(newCtx, forms[3])
        const func = Object.freeze({ kind: firstWord, name, parameters, restParam, body })
        return { type: 'closure', func }
      }
      case 'extern': {
        let ext = externs
        for (let i = 1; i < forms.length; i++) {
          const prop = getFormWord(forms[i])
          const extProp = ext[prop]
          if (extProp === undefined) throw compileError('undefined extern: ' + prop + ' in ' + ext)
          ext = extProp
        }
        return { type: 'constant', kind: firstWord, value: ext }
      }
      case 'def': {
        assertNumArgs(2)
        const name = getFormWord(forms[1])
        const value = compile(ctx, forms[2])
        defCtx.set(name, value)
        return { type: firstWord, name, value }
      }

      case 'loop':
      case 'continue':
      case 'recur':
        throw compileError('unexpected ' + firstWord)

      case 'if':
        assertNumArgs(3)
        return { type: firstWord, condition: compile(ctx, forms[1]), then: compile(forms[2]), else: compile(forms[3]) }
      case 'do':
        return { type: firstWord, ops: forms.map((form) => compile(ctx, form)) }
      case 'let': {
        assertNumArgs(2)
        const bindings = getFormList(forms[1])
        if (bindings.length % 2 !== 0) throw compileError('odd number of bindings')
        const compBindings = []
        const newCtx = makeCtx(ctx)
        for (let i = 0; i < bindings.length - 1; i += 2) {
          const varName = getFormWord(bindings[i])
          const localIndex = getLocalVar()
          compBindings.push({ localIndex, value: compile(newCtx, bindings[i + 1]) })
          newCtx.set(varName, localIndex)
        }
        return { type: firstWord, bindings: compBindings, body: compile(newCtx, forms[2]) }
      }
    }
    const funcObj = compile(ctx, firstForm)
    const args = forms.slice(1)
    if (funcObj.type !== 'closure') {
      if (funcObj.type === 'constant')
        // we know it's not a closure
        return { type: 'call', callKind: 'constant-func', func: funcObj, args: args.map((arg) => compile(ctx, arg)) }
      // the general case it can be a parameter, a local var immediate execution
      return { type: 'call', callKind: 'direct', func: funcObj, args: args.map((arg) => compile(ctx, arg)) }
    }
    const { parameters, restParam, name } = funcObj.func
    const nOfGivenArgs = args.length
    const nOfParams = parameters.length
    if (restParam) {
      if (nOfGivenArgs < nOfParams)
        throw compileError(`${name} expected at least ${nOfParams} arguments, got ${nOfGivenArgs}`)
    } else {
      if (nOfGivenArgs !== nOfParams) throw compileError(`${name} expected ${nOfParams} arguments, got ${nOfGivenArgs}`)
    }
    switch (funcObj.kind) {
      case 'func': {
        return
      }
      case 'macro': {
        return
      }
      case 'fexpr': {
        return
      }
      default:
        throw compileError('unexpected closure kind: ' + funcObj.kind)
    }
  }
  return { cform: compile(makeCtx(), form), nOfLocals: localVarCount }
}
