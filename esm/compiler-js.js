import { tryGetFormList, tryGetFormWord, makeValueTagger, isTaggedValue } from './core.js'
import { intrinsics } from './intrinsics.js'
import { jsExpToString, jsStmtToString } from './runtime-lib/js.js'

const jsExp =
  (ctor) =>
  (...args) => ({ tag: 'js-exp/' + ctor, args })

const jsStmt =
  (ctor) =>
  (...args) => ({ tag: 'js-stmt/' + ctor, args })

const jsNumber = jsExp('number')
const jsString = jsExp('string')
const jsBinop = jsExp('binop')
const jsAdd = (a, b) => jsBinop({ tag: 'binop/add', args: [] }, a, b)
const jsSub = (a, b) => jsBinop({ tag: 'binop/sub', args: [] }, a, b)
const jsBinIOr = (a, b) => jsBinop({ tag: 'binop/binary-ior', args: [] }, a, b)
const jsTernary = jsExp('ternary')
const jsVar = jsExp('var')
const jsCall = jsExp('call')
const jsArrowStmt = jsExp('arrow-stmt')

const jsIf = jsStmt('if')
const jsConstDecl = jsStmt('const-decl')
const jsLetDecl = jsStmt('let-decl')
const jsAssign = jsStmt('assign')
const jsBlock = jsStmt('block')
const jsSeq = jsStmt('seq')
const jsReturn = jsStmt('return')
const jsExpStmt = jsStmt('exp')
const jsWhile = jsStmt('while')
const jsContinue = jsStmt('continue')()
const jsSwitch = jsStmt('switch')

const jsIIFE = (stmt) => jsCall(jsArrowStmt([], { tag: 'option/none' }, stmt), [])

const opConstant = (value) => {
  if (typeof value === 'number') return jsNumber(value)
  if (typeof value === 'string') return jsString(value)
  throw new Error('unexpected constant value')
}
const js0 = opConstant(0)
const js1 = opConstant(1)
const jsUndefined = jsVar('undefined')
const jsSymbol = (name) => jsCall(jsVar('Symbol'), [jsString(name)])
const jsLangUndefined = jsSymbol('undefined')

const opIntrinsicCall = (opName, args) => {
  // if (opName === 'i32.add') return jsBinop({ tag: 'binop/add' }, ...args)
  switch (opName) {
    case 'i32.add':
      return jsBinIOr(jsAdd(...args), js0)
    case 'i32.sub':
      return jsBinIOr(jsSub(...args), js0)
    case 'i32.or':
      return jsBinIOr(...args)
    case 'f64.add':
      return jsAdd(...args)
    case 'f64.sub':
      return jsSub(...args)
    default:
      throw new Error('unexpected intrinsic')
  }
}
const opSwitch = (value, cases, defaultCase) => ({ op: 'switch', value, cases, defaultCase })
const opGetLocal = (index) => ({ op: 'getLocal', index })
const opSetLocal = (index, value) => ({ op: 'setLocal', index, value })
const opDefGet = (varName) => ({ op: 'defGet', varName })
const opInsts = (insts) => ({ op: 'insts', insts })
const opLoop = (body) => ({ op: 'loop', body })
const opContinue = () => ({ op: 'continue' })
const opFunc = (name, recIndex, paramIndexes, body) => ({ op: 'func', name, recIndex, paramIndexes, body })
const opCall = (func, args) => ({ op: 'call', func, args })
const opError = (message) => ({ op: 'error', message })

const compileEvalInst = (defEnv, inst) => {
  try {
    const jsStr = jsExpToString(inst)
    const func = new Function('return ' + jsStr)
    return func()
  } catch (e) {
    console.error(e)
    console.dir(inst, { depth: null })
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

const setNewLocal = (ctx, name) => {
  if (ctx.has(name)) return ctx.get(name)
  const m = maxLocalIndex(ctx)
  const index = m === null ? 0 : m + 1
  ctx.set(name, index)
  return index
}

const bodiesToStmts = (defEnv, ctx, tail, isTail) => {
  const stmts = []
  stmts.push(...tail.slice(0, -1).map((f) => compExpStmt(ctx, f, defEnv, false)))
  const lastStmt =
    tail.length > 0
      ? compExpStmt(ctx, tail.at(-1), defEnv, isTail)
      : isTail
        ? jsReturn(jsUndefined)
        : jsExpStmt(jsUndefined)
  stmts.push(lastStmt)
  return stmts
}

const compFunc = (tail, ctx, defEnv) => {
  const name = getFormWord(tail[0])
  const parameters = getFormList(tail[1]).map(getFormWord)
  const bodies = tail.slice(2)
  const hasNoRest = parameters.length < 2 || parameters.at(-2) !== '..'
  if (!hasNoRest) throw new CompileError('rest parameter not supported')
  const newCtx = makeCtx(ctx, 'func')
  setNewLocal(newCtx, name)
  parameters.map((p) => setNewLocal(newCtx, p))
  const arrow = jsArrowStmt(parameters, { tag: 'option/none' }, jsBlock(bodiesToStmts(defEnv, newCtx, bodies, true)))
  return jsIIFE(jsBlock([jsConstDecl(name, arrow), jsReturn(jsVar(name))]))
}

const expSpecialFormsExp = {
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
    return jsTernary(...tail.map((f) => compExp(ctx, f, defEnv)))
  },
  'type-anno': (tail, ctx, defEnv) => compExp(ctx, tail[0], defEnv),
}

const expSpecialFormsStmt = {
  if: (tail, ctx, defEnv, isTailPos) => {
    if (tail.length !== 3) throw new CompileError('if expected three arguments')
    return jsIf(
      compExp(ctx, tail[0], defEnv),
      jsBlock([compExpStmt(ctx, tail[1], defEnv, isTailPos)]),
      jsBlock([compExpStmt(ctx, tail[2], defEnv, isTailPos)]),
    )
  },
  let: (tail, ctx, defEnv, isTailPos) => {
    if (tail.length < 1) throw new CompileError('let expected at least a binding list')
    const [bindingForm, ...bodies] = tail
    const bindings = getFormList(bindingForm)
    if (bindings.length % 2 !== 0) throw new CompileError('odd number of bindings')
    const newCtx = makeCtx(ctx, 'let')
    const stmts = []
    for (let i = 0; i < bindings.length - 1; i += 2) {
      const varName = getFormWord(bindings[i])
      const isRedef = newCtx.has(varName)
      setNewLocal(newCtx, varName)
      const cexp = compExp(newCtx, bindings[i + 1], defEnv)
      stmts.push(isRedef ? jsAssign(varName, cexp) : jsLetDecl(varName, cexp))
    }
    stmts.push(...bodiesToStmts(defEnv, newCtx, bodies, isTailPos))
    return jsBlock(stmts)
  },
  letfn: (tail, ctx, defEnv, isTail) => {
    if (tail.length < 1) throw new CompileError('letfn expected at least a binding list')
    const [bindingForm, ...bodies] = tail
    const funcFormList = getFormList(bindingForm)
    const newCtx = makeCtx(ctx, 'letfn')
    const indexes = funcFormList.map((funcForm) => {
      const [firstFuncForm, ...rest] = getFormList(funcForm)
      if (getFormWord(firstFuncForm) !== 'func') throw new CompileError('expected func')
      const fname = getFormWord(rest[0])
      const isRedef = newCtx.has(fname)
      setNewLocal(newCtx, fname)
      return [fname, rest, isRedef]
    })
    const stmts = []
    for (const [fname, rest, isRedef] of indexes) {
      const funcInst = compFunc(rest, newCtx, defEnv)
      stmts.push(isRedef ? jsAssign(fname, funcInst) : jsLetDecl(fname, funcInst))
    }
    stmts.push(...bodiesToStmts(defEnv, newCtx, bodies, isTail))
    return jsBlock(stmts)
  },
  loop: (tail, ctx, defEnv, isTail) => {
    if (tail.length < 1) throw new CompileError('loop expected at least a binding list')
    const [bindingForm, ...bodies] = tail
    const bindings = getFormList(bindingForm)
    if (bindings.length % 2 !== 0) throw new CompileError('odd number of bindings')
    const newCtx = makeCtx(ctx, 'loop')
    const initStmts = []
    for (let i = 0; i < bindings.length - 1; i += 2) {
      const varName = getFormWord(bindings[i])
      const cexp = compExp(newCtx, bindings[i + 1], defEnv)
      const isRedef = newCtx.has(varName)
      setNewLocal(newCtx, varName)
      initStmts.push(isRedef ? jsAssign(varName, cexp) : jsLetDecl(varName, cexp))
    }
    const bodyStmts = bodiesToStmts(defEnv, newCtx, bodies, isTail)
    return jsBlock([...initStmts, jsWhile(js1, jsBlock(bodyStmts))])
  },
  continue: (tail, ctx, defEnv, isTailPos) => {
    if (!isTailPos) throw new CompileError('continue not in tail position')
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
      insts.push(jsAssign(variableName, compExp(ctx, tail[i + 1], defEnv)))
    }
    insts.push(jsContinue)
    return jsSeq(insts)
  },
  do: (tail, ctx, defEnv, isTailPos) => jsSeq(bodiesToStmts(defEnv, ctx, tail, isTailPos)),
  switch: (tail, ctx, defEnv) => {
    if (tail.length < 2) throw new CompileError(`special form 'switch' expected at least two arguments`)
    if (tail.length % 2 !== 0) throw new CompileError('no switch default found')
    const cvalue = compExp(ctx, tail[0], defEnv)
    const cases = []
    for (let i = 1; i < tail.length - 1; i += 2) {
      const values = getFormList(tail[i]).map((patForm) => compExp(ctx, patForm, defEnv))
      const branchBody = compExpStmt(ctx, tail[i + 1], defEnv, true)
      cases.push({ fst: values, snd: branchBody })
    }
    const defaultForm = tail.at(-1)
    return jsSwitch(cvalue, cases, compExpStmt(ctx, defaultForm, defEnv, true))
  },
  match: (forms, lctx, defEnv) => {
    throw new CompileError('not implemented')
  },
}

let tmpVarCounter = 0

const defFuncLike = (firstWord, tail, defEnv) => {
  const defName = getFormWord(tail[0])
  const parameters = getFormList(tail[1]).map(getFormWord)
  const bodies = tail.slice(2)
  const hasNoRest = parameters.length < 2 || parameters.at(-2) !== '..'
  if (!hasNoRest) throw new CompileError('rest parameter not supported')
  const newCtx = new Map()
  const recIndex = setNewLocal(newCtx, defName)
  const paramIndexes = parameters.map((p) => setNewLocal(newCtx, p))
  throw new CompileError('not implemented')
}

const setDef = (defEnv, varName, desc) => {
  if (defEnv.has(varName)) throw new CompileError('redefining variable')
  defEnv.set(varName, desc)
}

const topSpecialForms = {
  def: (_, tail, defEnv) => {
    if (tail.length !== 2) throw new CompileError('def expected two arguments')
    throw new CompileError('not implemented')
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
  type: (_, forms, defEnv) => {
    throw new CompileError('not implemented')
  },
  export: () => {
    throw new CompileError('not implemented')
  },
  import: async (_, tail, defEnv) => {
    throw new CompileError('not implemented')
  },
}

const compExpStmt = (ctx, form, defEnv, isTail) => {
  const forms = tryGetFormList(form)
  if (forms) {
    if (forms.length === 0) throw new CompileError('empty list')
    const [firstForm, ...args] = forms
    const firstWord = tryGetFormWord(firstForm)
    if (firstWord) {
      const stmtSpecialHandler = expSpecialFormsStmt[firstWord]
      if (stmtSpecialHandler) return stmtSpecialHandler(args, ctx, defEnv, isTail)
    }
  }
  const jsExp = compExp(ctx, form, defEnv)
  return isTail ? jsReturn(jsExp) : jsExpStmt(jsExp)
}

const compExp = (ctx, form, defEnv) => {
  const word = tryGetFormWord(form)
  if (word) {
    let curCtx = ctx
    while (curCtx) {
      if (curCtx.has(word)) return jsVar(word)
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
    // if (firstWord === 'do') return opInsts(args.map((f) => compExp(ctx, f, defEnv)))
    // const topSpecialHandler = topSpecialForms[firstWord]
    // if (topSpecialHandler) throw new CompileError('top special not allowed in expression form')

    const expSpecialHandler = expSpecialFormsExp[firstWord]
    if (expSpecialHandler) return expSpecialHandler(args, ctx, defEnv)

    const stmtSpecialHandler = expSpecialFormsStmt[firstWord]
    if (stmtSpecialHandler) return jsIIFE(stmtSpecialHandler(args, ctx, defEnv, true))

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
        case 'type':
          break
        default:
          throw new CompileError('unexpected defKind')
      }
    }
  }
  return jsCall(
    compExp(ctx, firstForm, defEnv),
    args.map((arg) => compExp(ctx, arg, defEnv)),
  )
  // return opCall(
  //   compExp(ctx, firstForm, defEnv),
  //   args.map((arg) => compExp(ctx, arg, defEnv)),
  // )
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

export const makeJSCompilingEvaluator = () => {
  const defEnv = new Map()
  const evalExp = (form) => {
    const ce = compExpStmt(null, form, defEnv, true)
    const f = new Function(jsStmtToString(ce))
    return f()
  }
  const evalTop = async (form) => evalTopDefEnv(defEnv, form)
  return { evalExp, evalTop }
}
