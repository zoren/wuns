import { langUndefined, tryGetFormList, tryGetFormWord } from './core.js'
import { intrinsics } from './intrinsics.js'

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

const opConstant = (value) => ({ op: 'constant', value })
const opIntrinsicCall = (opName, args) => ({ op: 'intrinsic', opName, args })
const opIf = (cond, ctrue, cfalse) => ({ op: 'if', cond, ctrue, cfalse })
const opSwitch = (value, cases, defaultCase) => ({ op: 'switch', value, cases, defaultCase })
const opGetLocal = (index) => ({ op: 'getLocal', index })
const opSetLocal = (index, value) => ({ op: 'setLocal', index, value })
const opInsts = (insts) => ({ op: 'insts', insts })
const opLoop = (body) => ({ op: 'loop', body })
const opContinue = () => ({ op: 'continue' })

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
        return undefined
      }
    }
    case 'insts': {
      const { insts } = inst
      const cinsts = insts.map(evalOp)
      return (env) => {
        let lastValue = null
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
    default:
      throw new CompileError('unexpected op')
  }
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
  for (const value of ctx.values()) {
    lastValue = value
  }
  // console.log('maxLocalIndex', { ctx, lastValue })
  if (lastValue !== null) return lastValue
  if (ctx.outer) return maxLocalIndex(ctx.outer)
  return null
}

const newLocal = (ctx, name) => {
  // if (ctx.has(name)) throw new CompileError('variable already defined')
  // console.log('new local', { ctx, name })
  const m = maxLocalIndex(ctx)
  const index = m === null ? 0 : m + 1
  // console.log('new local', { ctx, name, m, index })

  ctx.set(name, index)
  return index
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
    return opIntrinsicCall(
      opName,
      args.map((arg) => compExp(ctx, arg)),
    )
  },
  func: (tail, ctx) => {
    throw new CompileError('not implemented')
  },
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
  match: () => {
    throw new CompileError('not implemented')
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
    if (tail.length === 1) {
      insts.push(opConstant(langUndefined))
    } else {
      insts.push(...tail.slice(1).map((f) => compExp(newCtx, f)))
    }
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
    if (tail.length === 1) {
      bodyInsts.push(opConstant(langUndefined))
    } else {
      bodyInsts.push(...tail.slice(1).map((f) => compExp(newCtx, f)))
    }
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
  letfn: () => {
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
  do: () => {
    throw new CompileError('not implemented')
  },
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
  const compileError = (message, innerError) => new CompileError(message, form, innerError)
  const word = tryGetFormWord(form)
  if (word) {
    let curCtx = ctx
    while (curCtx) {
      if (curCtx.has(word)) return opGetLocal(curCtx.get(word))
      curCtx = curCtx.outer
    }
    throw compileError('undefined variable: ' + word)
  }
  const forms = tryGetFormList(form)
  if (!forms) {
    // here we throw an Error not an evalError as the input is not a form
    throw new Error('expected a valid form value', { cause: form })
  }
  if (forms.length === 0) throw compileError('empty list')

  const [firstForm, ...args] = forms
  const firstWord = tryGetFormWord(firstForm)
  if (!firstWord) throw compileError('not a word')
  const topSpecialHandler = topSpecialForms[firstWord]
  if (topSpecialHandler) throw compileError('top special not allowed in expression form')

  const expSpecialHandler = expSpecialForms[firstWord]
  if (expSpecialHandler) return expSpecialHandler(args, ctx)

  throw compileError('not a function')
}

export const compEval = (form) => {
  const ctx = new Map()
  const cform = compExp(ctx, form)
  const eop = evalOp(cform)
  const env = []
  return eop(env)
}
const gauss = `
[loop [i [i32 10]
       result [i32 0]]
  [if i
    [continue
      result [intrinsic-call i32.add result i]
      i [intrinsic-call i32.sub i [i32 1]]]
    result]]]`
import { parseString } from './core.js'
const forms = parseString(gauss, 'gauss')
const ctx = new Map()
const cform = compExp(ctx, forms[0])
// console.dir(cform, { depth: null })
