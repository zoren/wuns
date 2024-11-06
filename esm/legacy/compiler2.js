import { setJSFunctionName } from '../utils.js'
import { langUndefined, tryGetFormList, tryGetFormWord } from '../core.js'
import { intrinsics } from '../intrinsics.js'

const opConstant = (value) => ({ op: 'constant', value })
const opIntrinsicCall = (opName, args) => ({ op: 'intrinsic', opName, args })
const opIf = (cond, ctrue, cfalse) => ({ op: 'if', cond, ctrue, cfalse })
const opSwitch = (value, cases, defaultCase) => ({ op: 'switch', value, cases, defaultCase })
const opGetLocal = (index) => ({ op: 'getLocal', index })
const opSetLocal = (index, value) => ({ op: 'setLocal', index, value })
const opDefGet = (varName) => ({ op: 'defGet', varName })
const opInsts = (insts) => ({ op: 'insts', insts })
const opLoop = (body) => ({ op: 'loop', body })
const opContinue = () => ({ op: 'continue' })
const opFunc = (name, recIndex, paramIndexes, body) => ({ op: 'func', name, recIndex, paramIndexes, body })
const opCall = (func, args) => ({ op: 'call', func, args })

const continueValue = Symbol('continue')

const compileEvalInst = (defEnv, inst) => {
  const go = (inst) => {
    switch (inst.op) {
      case 'constant': {
        const { value } = inst
        return () => value
      }
      case 'intrinsic': {
        const { opName, args } = inst
        const func = intrinsics[opName]
        const cargs = args.map((arg) => go(arg))
        return (env) => func(...cargs.map((carg) => carg(env)))
      }
      case 'if': {
        const ccond = go(inst.cond)
        const ctrue = go(inst.ctrue)
        const cfalse = go(inst.cfalse)
        return (env) => (ccond(env) !== 0 ? ctrue : cfalse)(env)
      }
      case 'switch': {
        const { value, cases, defaultCase } = inst
        const cvalue = go(value)
        const ccases = cases.map(([values, body]) => [values.map(go), go(body)])
        const cdefaultCase = go(defaultCase)
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
        const cvalue = go(value)
        return (env) => {
          env[index] = cvalue(env)
          return langUndefined
        }
      }
      case 'defGet': {
        const { varName } = inst
        return () => defEnv.get(varName).value
      }
      case 'insts': {
        const { insts } = inst
        const cinsts = insts.map(go)
        return (env) => {
          let lastValue = langUndefined
          for (const cinst of cinsts) lastValue = cinst(env)
          return lastValue
        }
      }
      case 'loop': {
        const { body } = inst
        const cbody = go(body)
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
        const cbody = go(body)
        return (env) => {
          const f = (...args) => {
            // todo here make a chained env instead so we don't copy the whole env
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
        const cfunc = go(func)
        const cargs = args.map(go)
        const ccall = (env) => cfunc(env)(...cargs.map((carg) => carg(env)))
        // should we tail call optimize here?
        return ccall
      }
      default:
        throw new Error('unexpected op')
    }
  }
  const eop = go(inst)
  const localEnv = []
  return eop(localEnv)
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
  if (!(outer === null || outer instanceof Map)) throw new Error('makeCtx expects null or a Map')
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

const compFunc = (tail, ctx, defEnv) => {
  const name = getFormWord(tail[0])
  const parameters = getFormList(tail[1]).map(getFormWord)
  const bodies = tail.slice(2)
  const hasNoRest = parameters.length < 2 || parameters.at(-2) !== '..'
  if (!hasNoRest) throw new CompileError('rest parameter not supported')
  const newCtx = makeCtx(ctx, 'func')
  const recIndex = newLocal(newCtx, name)
  const paramIndexes = parameters.map((p) => newLocal(newCtx, p))
  return opFunc(name, recIndex, paramIndexes, opInsts(bodies.map((f) => compExp(newCtx, f, defEnv))))
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
  'intrinsic-call': (tail, ctx, defEnv) => {
    if (tail.length < 1) throw new CompileError('intrinsic-call expected at least one argument')
    const [opForm, ...args] = tail
    const opName = getFormWord(opForm)
    if (!intrinsics[opName]) throw new CompileError('undefined intrinsic')
    if (args.length !== intrinsics[opName].length) throw new CompileError('wrong number of arguments')
    return opIntrinsicCall(
      opName,
      args.map((arg) => compExp(ctx, arg, defEnv)),
    )
  },
  func: compFunc,
  if: (tail, ctx, defEnv) => {
    if (tail.length !== 3) throw new CompileError('if expected three arguments')
    return opIf(...tail.map((f) => compExp(ctx, f, defEnv)))
  },
  switch: (tail, ctx, defEnv) => {
    if (tail.length < 2) throw new CompileError(`special form 'switch' expected at least two arguments`)
    if (tail.length % 2 !== 0) throw new CompileError('no switch default found')
    const cvalue = compExp(ctx, tail[0], defEnv)
    const cases = []
    for (let i = 1; i < tail.length - 1; i += 2) {
      const values = getFormList(tail[i]).map((patForm) => compExp(ctx, patForm, defEnv))
      const branchBody = compExp(ctx, tail[i + 1], defEnv)
      cases.push([values, branchBody])
    }
    const defaultForm = tail.at(-1)
    return opSwitch(cvalue, cases, compExp(ctx, defaultForm, defEnv))
  },
  let: (tail, ctx, defEnv) => {
    if (tail.length < 1) throw new CompileError('let expected at least a binding list')
    const bindings = getFormList(tail[0])
    if (bindings.length % 2 !== 0) throw new CompileError('odd number of bindings')
    const newCtx = makeCtx(ctx, 'let')
    const insts = []
    for (let i = 0; i < bindings.length - 1; i += 2) {
      const varName = getFormWord(bindings[i])
      const varIndex = newLocal(newCtx, varName)
      const cexp = compExp(newCtx, bindings[i + 1], defEnv)
      insts.push(opSetLocal(varIndex, cexp))
    }
    insts.push(...tail.slice(1).map((f) => compExp(newCtx, f, defEnv)))
    return opInsts(insts)
  },
  letfn: (tail, ctx, defEnv) => {
    if (tail.length < 1) throw new CompileError('let expected at least a binding list')
    const funcFormList = getFormList(tail[0])
    const newCtx = makeCtx(ctx, 'letfn')
    const indexes = funcFormList.map((funcForm) => {
      const [firstFuncForm, ...rest] = getFormList(funcForm)
      if (getFormWord(firstFuncForm) !== 'func') throw new CompileError('expected func')
      return [newLocal(newCtx, getFormWord(rest[0])), rest]
    })
    const insts = indexes.map(([varIndex, rest]) => opSetLocal(varIndex, compFunc(rest, newCtx, defEnv)))
    insts.push(...tail.slice(1).map((f) => compExp(newCtx, f, defEnv)))
    return opInsts(insts)
  },
  loop: (tail, ctx, defEnv) => {
    if (tail.length < 1) throw new CompileError('loop expected at least a binding list')
    const bindings = getFormList(tail[0])
    if (bindings.length % 2 !== 0) throw new CompileError('odd number of bindings')
    const newCtx = makeCtx(ctx, 'loop')
    const initInsts = []
    for (let i = 0; i < bindings.length - 1; i += 2) {
      const varName = getFormWord(bindings[i])
      const cexp = compExp(newCtx, bindings[i + 1], defEnv)
      const varIndex = newLocal(newCtx, varName)
      initInsts.push(opSetLocal(varIndex, cexp))
    }
    const bodyInsts = []
    bodyInsts.push(...tail.slice(1).map((f) => compExp(newCtx, f, defEnv)))
    return opInsts([opInsts(initInsts), opLoop(opInsts(bodyInsts))])
  },
  continue: (tail, ctx, defEnv) => {
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
      insts.push(opSetLocal(loopContext.get(variableName), compExp(ctx, tail[i + 1], defEnv)))
    }
    insts.push(opContinue())
    return opInsts(insts)
  },
  do: (tail, ctx, defEnv) => opInsts(tail.map((f) => compExp(ctx, f, defEnv))),
  match: () => {
    throw new CompileError('not implemented')
  },
  'type-anno': (tail, ctx, defEnv) => compExp(ctx, tail[0], defEnv),
}

const defFuncLike = (firstWord, tail, defEnv) => {
  const defName = getFormWord(tail[0])
  const parameters = getFormList(tail[1]).map(getFormWord)
  const bodies = tail.slice(2)
  const hasNoRest = parameters.length < 2 || parameters.at(-2) !== '..'
  if (!hasNoRest) throw new CompileError('rest parameter not supported')
  const newCtx = new Map()
  const recIndex = newLocal(newCtx, defName)
  const paramIndexes = parameters.map((p) => newLocal(newCtx, p))
  const funcInst = opFunc(defName, recIndex, paramIndexes, opInsts(bodies.map((f) => compExp(newCtx, f, defEnv))))
  const value = compileEvalInst(defEnv, funcInst)
  defEnv.set(defName, { defKind: firstWord, value })
}

const setDef = (defEnv, varName, desc) => {
  if (defEnv.has(varName)) throw new CompileError('redefining variable')
  defEnv.set(varName, desc)
}

const topSpecialForms = {
  def: (_, tail, defEnv) => {
    if (tail.length !== 2) throw new CompileError('def expected two arguments')
    const varName = getFormWord(tail[0])
    const cvalue = compExp(null, tail[1], defEnv)
    const value = compileEvalInst(defEnv, cvalue)
    setDef(defEnv, varName, { defKind: 'def', value })
  },
  defn: defFuncLike,
  defexpr: defFuncLike,
  defmacro: defFuncLike,
  do: async (_, tail, defEnv) => {
    for (const form of tail) await evalTopDefEnv(defEnv, form)
  },
  load: () => {
    throw new CompileError('not implemented')
  },
  type: (_, tail, defEnv) => {
    throw new CompileError('not implemented')
  },
  export: () => {
    throw new CompileError('not implemented')
  },
  import: async (_, tail, defEnv) => {
    if (tail.length !== 3) throw evalError('import expects three arguments')
    const importModuleName = getFormWord(tail[0])
    const importElementName = getFormWord(tail[1])
    const module = await import(`./runtime-lib/${importModuleName}.js`)
    const importedValue = module[importElementName]
    if (importedValue === undefined)
      throw evalError('imported value not found in module ' + importModuleName + ' ' + importElementName)
    setDef(defEnv, importElementName, { defKind: 'import', value: importedValue })
  },
}

const compExp = (ctx, form, defEnv) => {
  const word = tryGetFormWord(form)
  if (word) {
    let curCtx = ctx
    while (curCtx) {
      if (curCtx.has(word)) return opGetLocal(curCtx.get(word))
      curCtx = curCtx.outer
    }
    const desc = defEnv.get(word)
    if (!desc) throw new CompileError('undefined variable: ' + word)
    const { defKind } = desc
    if (defKind === 'defmacro') throw new CompileError('macro in value position')
    if (defKind === 'defexpr') throw new CompileError('fexpr in value position')
    return opDefGet(word)
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
    if (firstWord === 'do') return opInsts(args.map((f) => compExp(ctx, f, defEnv)))
    const topSpecialHandler = topSpecialForms[firstWord]
    if (topSpecialHandler) throw new CompileError('top special not allowed in expression form')

    const expSpecialHandler = expSpecialForms[firstWord]
    if (expSpecialHandler) return expSpecialHandler(args, ctx, defEnv)

    const d = defEnv.get(firstWord)
    if (d) {
      const { defKind } = d
      switch (defKind) {
        case 'defmacro': {
          const callInst = opCall(opDefGet(firstWord), args.map(opConstant))
          const macroForm = compileEvalInst(defEnv, callInst)
          return compExp(ctx, macroForm, defEnv)
        }
        case 'defexpr':
          return opCall(opDefGet(firstWord), args.map(opConstant))
        case 'defn':
        case 'def':
          break
        default:
          throw new CompileError('unexpected defKind')
      }
    }
  }
  return opCall(
    compExp(ctx, firstForm, defEnv),
    args.map((arg) => compExp(ctx, arg, defEnv)),
  )
}

const evalTopDefEnv = async (defEnv, form) => {
  const forms = tryGetFormList(form)
  if (forms && forms.length > 0) {
    const [firstForm, ...args] = forms
    const firstWord = tryGetFormWord(firstForm)
    if (firstWord) {
      const topSpecialHandler = topSpecialForms[firstWord]
      if (topSpecialHandler) {
        await topSpecialHandler(firstWord, args, defEnv)
        return true
      }
    }
  }
  return false
}

export const makeCompilingEvaluator = () => {
  const defEnv = new Map()
  const evalExp = form => compileEvalInst(defEnv, compExp(null, form, defEnv))
  const evalTop = async (form) => evalTopDefEnv(defEnv, form)
  return { evalExp, evalTop }
}
