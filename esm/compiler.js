import { setJSFunctionName } from './utils.js'
import { langUndefined, tryGetFormList, tryGetFormWord } from './core.js'
import { intrinsics } from './intrinsics.js'

const opConstant = (value) => ({ op: 'constant', value })
const opIntrinsicCall = (opName, args) => ({ op: 'intrinsic', opName, args })
const opIf = (cond, ctrue, cfalse) => ({ op: 'if', cond, ctrue, cfalse })
const opSwitch = (value, cases, defaultCase) => ({ op: 'switch', value, cases, defaultCase })
const opGetLocal = (index) => ({ op: 'getLocal', index })
const opSetLocal = (index, value) => ({ op: 'setLocal', index, value })
const opInsts = (insts) => ({ op: 'insts', insts })
const opLoop = (body) => ({ op: 'loop', body })
const opContinue = () => ({ op: 'continue' })
const opFunc = (name, recIndex, paramIndexes, body) => ({ op: 'func', name, recIndex, paramIndexes, body })
const opCall = (func, args) => ({ op: 'call', func, args })

const continueValue = Symbol('continue')

const evalOp = (inst) => {
  switch (inst.op) {
    case 'constant': {
      const { value } = inst
      return () => value
    }
    case 'intrinsic': {
      const { opName, args } = inst
      const func = intrinsics[opName]
      const cargs = args.map((arg) => evalOp(arg))
      return (env) => func(...cargs.map((carg) => carg(env)))
    }
    case 'if': {
      const ccond = evalOp(inst.cond)
      const ctrue = evalOp(inst.ctrue)
      const cfalse = evalOp(inst.cfalse)
      return (env) => (ccond(env) !== 0 ? ctrue(env) : cfalse(env))
    }
    case 'switch': {
      const { value, cases, defaultCase } = inst
      const cvalue = evalOp(value)
      const ccases = cases.map(([values, body]) => [values.map(evalOp), evalOp(body)])
      const cdefaultCase = evalOp(defaultCase)
      return (env) => {
        const evalue = cvalue(env)
        for (const [fs, body] of ccases) if (fs.some((f) => f(env) === evalue)) return body(env)
        return cdefaultCase(env)
      }
    }
    case 'getLocal': {
      const { index } = inst
      return (env) => env[index]
    }
    case 'setLocal': {
      const { index, value } = inst
      const cvalue = evalOp(value)
      return (env) => {
        env[index] = cvalue(env)
        return langUndefined
      }
    }
    case 'insts': {
      const { insts } = inst
      const cinsts = insts.map(evalOp)
      return (env) => {
        let lastValue = langUndefined
        for (const cinst of cinsts) lastValue = cinst(env)
        return lastValue
      }
    }
    case 'loop': {
      const { body } = inst
      const cbody = evalOp(body)
      return (env) => {
        while (1) {
          const loopBody = cbody(env)
          if (loopBody === continueValue) continue
          return loopBody
        }
      }
    }
    case 'continue': {
      return () => {
        return continueValue
      }
    }
    case 'func': {
      const { name, recIndex, paramIndexes, body } = inst
      const cbody = evalOp(body)
      return (env) => {
        const f = (...args) => {
          const newEnv = [...env]
          for (let i = 0; i < paramIndexes.length; i++) newEnv[paramIndexes[i]] = args[i]
          return cbody(newEnv)
        }
        env[recIndex] = f
        setJSFunctionName(f, name)
        return f
      }
    }
    case 'call': {
      const { func, args } = inst
      const cfunc = evalOp(func)
      const cargs = args.map(evalOp)
      return (env) => cfunc(env)(...cargs.map((carg) => carg(env)))
    }
    default:
      throw new Error('unexpected op')
  }
}

class CompileError extends Error {
  constructor(message) {
    super(message)
  }
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

const makeCtx = (outer, declaringForm) => {
  if (!(outer instanceof Map)) throw new Error('makeCtx expects a Map')
  const ctx = new Map()
  ctx.outer = outer
  ctx.declaringForm = declaringForm
  return ctx
}

const maxLocalIndex = (ctx) => {
  let lastValue = null
  for (const value of ctx.values()) lastValue = value
  if (lastValue !== null) return lastValue
  if (ctx.outer) return maxLocalIndex(ctx.outer)
  return null
}

const newLocal = (ctx, name) => {
  if (ctx.has(name)) return ctx.get(name)
  const m = maxLocalIndex(ctx)
  const index = m === null ? 0 : m + 1
  ctx.set(name, index)
  return index
}

const compFunc = (tail, ctx) => {
  const name = getFormWord(tail[0])
  const parameters = getFormList(tail[1]).map(getFormWord)
  const bodies = tail.slice(2)
  const hasNoRest = parameters.length < 2 || parameters.at(-2) !== '..'
  if (!hasNoRest) throw new CompileError('rest parameter not supported')
  const newCtx = makeCtx(ctx, 'func')
  const recIndex = newLocal(newCtx, name)
  const paramIndexes = parameters.map((p) => newLocal(newCtx, p))
  return opFunc(name, recIndex, paramIndexes, opInsts(bodies.map((f) => compExp(newCtx, f))))
}

const expSpecialForms = {
  i32: (tail) => {
    if (tail.length !== 1) throw new CompileError('i32 expected one argument')
    const v = +getFormWord(tail[0])
    const normalized = v | 0
    if (v !== normalized) throw new CompileError('expected i32')
    return opConstant(normalized)
  },
  f64: (tail) => {
    if (tail.length !== 1) throw new CompileError('f64 expected one argument')
    const v = +getFormWord(tail[0])
    if (isNaN(v)) throw new CompileError('expected number')
    return opConstant(v)
  },
  word: (tail) => {
    if (tail.length !== 1) throw new CompileError('word expected one argument')
    return opConstant(getFormWord(tail[0]))
  },
  'intrinsic-call': (tail, ctx) => {
    if (tail.length < 1) throw new CompileError('intrinsic-call expected at least one argument')
    const [opForm, ...args] = tail
    const opName = getFormWord(opForm)
    if (!intrinsics[opName]) throw new CompileError('undefined intrinsic')
    if (args.length !== intrinsics[opName].length) throw new CompileError('wrong number of arguments')
    return opIntrinsicCall(
      opName,
      args.map((arg) => compExp(ctx, arg)),
    )
  },
  func: compFunc,
  if: (tail, ctx) => {
    if (tail.length !== 3) throw new CompileError('if expected three arguments')
    return opIf(...tail.map((f) => compExp(ctx, f)))
  },
  switch: (tail, ctx) => {
    if (tail.length < 2) throw new CompileError(`special form 'switch' expected at least two arguments`)
    if (tail.length % 2 !== 0) throw new CompileError('no switch default found')
    const cvalue = compExp(ctx, tail[0])
    const cases = []
    for (let i = 1; i < tail.length - 1; i += 2) {
      const values = getFormList(tail[i]).map((patForm) => compExp(ctx, patForm))
      const branchBody = compExp(ctx, tail[i + 1])
      cases.push([values, branchBody])
    }
    const defaultForm = tail.at(-1)
    return opSwitch(cvalue, cases, compExp(ctx, defaultForm))
  },
  let: (tail, ctx) => {
    if (tail.length < 1) throw new CompileError('let expected at least a binding list')
    const bindings = getFormList(tail[0])
    if (bindings.length % 2 !== 0) throw new CompileError('odd number of bindings')
    const newCtx = makeCtx(ctx, 'let')
    const insts = []
    for (let i = 0; i < bindings.length - 1; i += 2) {
      const varName = getFormWord(bindings[i])
      const varIndex = newLocal(newCtx, varName)
      const cexp = compExp(newCtx, bindings[i + 1])
      insts.push(opSetLocal(varIndex, cexp))
    }
    insts.push(...tail.slice(1).map((f) => compExp(newCtx, f)))
    return opInsts(insts)
  },
  letfn: (tail, ctx) => {
    if (tail.length < 1) throw new CompileError('let expected at least a binding list')
    const funcForms = getFormList(tail[0])
    const newCtx = makeCtx(ctx, 'letfn')
    const indexes = []
    for (const funcForm of funcForms) {
      const [firstFuncForm, funcNameForm] = getFormList(funcForm)
      if (getFormWord(firstFuncForm) !== 'func') throw new CompileError('expected func')
      indexes.push(newLocal(newCtx, getFormWord(funcNameForm)))
    }
    const insts = []
    for (let i = 0; i < funcForms.length; i++) {
      const cfunc = compFunc(getFormList(funcForms[i]).slice(1), newCtx)
      insts.push(opSetLocal(indexes[i], cfunc))
    }
    insts.push(...tail.slice(1).map((f) => compExp(newCtx, f)))
    return opInsts(insts)
  },
  loop: (tail, ctx) => {
    if (tail.length < 1) throw new CompileError('loop expected at least a binding list')
    const bindings = getFormList(tail[0])
    if (bindings.length % 2 !== 0) throw new CompileError('odd number of bindings')
    const newCtx = makeCtx(ctx, 'loop')
    const initInsts = []
    for (let i = 0; i < bindings.length - 1; i += 2) {
      const varName = getFormWord(bindings[i])
      const cexp = compExp(newCtx, bindings[i + 1])
      const varIndex = newLocal(newCtx, varName)
      initInsts.push(opSetLocal(varIndex, cexp))
    }
    const bodyInsts = []
    bodyInsts.push(...tail.slice(1).map((f) => compExp(newCtx, f)))
    return opInsts([opInsts(initInsts), opLoop(opInsts(bodyInsts))])
  },
  continue: (tail, ctx) => {
    let loopContext = ctx
    while (loopContext) {
      if (loopContext.declaringForm === 'loop') break
      loopContext = loopContext.outer
    }
    if (!loopContext) throw new CompileError('continue not in a loop')
    const insts = []
    for (let i = 0; i < tail.length; i += 2) {
      const variableForm = tail[i]
      const variableName = getFormWord(variableForm)
      if (!loopContext.has(variableName)) throw new CompileError('continue, not a loop variable')
      insts.push(opSetLocal(loopContext.get(variableName), compExp(ctx, tail[i + 1])))
    }
    insts.push(opContinue())
    return opInsts(insts)
  },
  do: (tail, ctx) => opInsts(tail.map((f) => compExp(ctx, f))),
  match: () => {
    throw new CompileError('not implemented')
  },
  'type-anno': () => {
    throw new CompileError('not implemented')
  },
}

const topSpecialForms = {
  def: () => {
    throw new CompileError('not implemented')
  },
  defn: () => {
    throw new CompileError('not implemented')
  },
  defexpr: () => {
    throw new CompileError('not implemented')
  },
  defmacro: () => {
    throw new CompileError('not implemented')
  },
  // do: () => {
  //   throw new CompileError('not implemented')
  // },
  load: () => {
    throw new CompileError('not implemented')
  },
  type: () => {
    throw new CompileError('not implemented')
  },
  export: () => {
    throw new CompileError('not implemented')
  },
  import: () => {
    throw new CompileError('not implemented')
  },
}

const compExp = (ctx, form) => {
  const word = tryGetFormWord(form)
  if (word) {
    let curCtx = ctx
    while (curCtx) {
      if (curCtx.has(word)) return opGetLocal(curCtx.get(word))
      curCtx = curCtx.outer
    }
    throw new CompileError('undefined variable: ' + word)
  }
  const forms = tryGetFormList(form)
  if (!forms) {
    // here we throw an Error not an CompileError as the input is not a form
    throw new Error('expected a valid form value', { cause: form })
  }
  if (forms.length === 0) throw new CompileError('empty list')

  const [firstForm, ...args] = forms
  const firstWord = tryGetFormWord(firstForm)
  if (firstWord) {
    const topSpecialHandler = topSpecialForms[firstWord]
    if (topSpecialHandler) throw new CompileError('top special not allowed in expression form')

    const expSpecialHandler = expSpecialForms[firstWord]
    if (expSpecialHandler) return expSpecialHandler(args, ctx)
  }
  const cfunc = compExp(ctx, firstForm)
  const cargs = args.map((arg) => compExp(ctx, arg))
  return opCall(cfunc, cargs)
}

export const compEval = (form) => {
  const ctx = new Map()
  const cform = compExp(ctx, form)
  const eop = evalOp(cform)
  // todo init the array with the maximum number of locals
  const env = []
  return eop(env)
}
