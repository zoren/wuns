import {
  tryGetFormList,
  tryGetFormWord,
  optionNone,
  makeOptionSome,
  makeTaggedValue,
  parseString,
  wordToI32,
} from './core.js'
import { intrinsics } from './intrinsics.js'
import { escapeIdentifier, jsExpToString, jsStmtToString } from './runtime-lib/js.js'

const jsExp =
  (ctor) =>
  (...args) =>
    makeTaggedValue('js-exp/' + ctor, ...args)

const jsStmt =
  (ctor) =>
  (...args) =>
    makeTaggedValue('js-stmt/' + ctor, ...args)

const jsNumber = jsExp('number')
const jsString = jsExp('string')
const jsBinop = jsExp('binop')
const jsBin = (s) => (a, b) => jsBinop(makeTaggedValue('binop/' + s), a, b)
const jsAdd = jsBin('add')
const jsSub = jsBin('sub')
const jsBinIOr = jsBin('binary-ior')
const jsTernary = jsExp('ternary')
const jsVar = jsExp('var')
const jsCall = jsExp('call')
const jsArrowStmt = jsExp('arrow-stmt')
const jsArrowExp = jsExp('arrow-exp')
const jsArray = jsExp('array')
const jsObject = jsExp('object')
const jsAwait = jsExp('await')
const jsSubscript = jsExp('subscript')
const jsNew = jsExp('new')
const jsAssignExp = jsExp('assign-exp')
const jsParenComma = jsExp('paren-comma')

const jsArrowExpNoRest = (params, body) => jsArrowExp(params, optionNone, body)

const js0 = jsNumber(0)
const js1 = jsNumber(1)
const jsUndefined = jsVar('undefined')

const mkObject = (...args) => jsObject(args.map(([k, v]) => ({ fst: k, snd: v })))
const mkTaggedObject = (tag, ...args) => mkObject(['tag', jsString(tag)], ['args', jsArray(args)])

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
const jsThrow = jsStmt('throw')

const jsIIFE = (stmts) => jsCall(jsArrowStmt([], optionNone, jsBlock(stmts)), [])

const opIntrinsicCall = (opName, args) => {
  switch (opName) {
    case 'i32.add':
      return jsBinIOr(jsAdd(...args), js0)
    case 'i32.sub':
      return jsBinIOr(jsSub(...args), js0)
    case 'i32.mul':
      return jsBinIOr(jsBin('mul')(...args), js0)
    case 'i32.div-s':
      return jsBinIOr(jsBin('div')(...args), js0)
    case 'i32.rem-s':
      return jsBinIOr(jsBin('rem')(...args), js0)
    case 'i32.and':
      return jsBin('binary-and')(...args)
    case 'i32.or':
      return jsBinIOr(...args)
    case 'i32.xor':
      return jsBin('binary-xor')(...args)
    case 'i32.shl':
      return jsBin('binary-shl')(...args)
    case 'i32.shr-s':
      return jsBin('binary-shr')(...args)
    case 'i32.shr-u':
      return jsBin('binary-shr-u')(...args)
    case 'i32.eq':
      return jsBinIOr(jsBin('eq')(...args), js0)
    case 'i32.lt-s':
      return jsBinIOr(jsBin('lt')(...args), js0)
    case 'i32.le-s':
      return jsBinIOr(jsBin('le')(...args), js0)

    case 'f64.add':
      return jsAdd(...args)
    case 'f64.sub':
      return jsSub(...args)
    case 'unreachable':
      return jsIIFE([jsThrow(jsString('unreachable'))])
    default:
      throw new Error('unexpected intrinsic: ' + opName)
  }
}

class CompileError extends Error {
  constructor(message, form) {
    super(message)
    this.form = form
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
  if (!(outer === null || outer instanceof Set)) throw new Error('makeCtx expects null or a context')
  const ctx = new Set()
  ctx.outer = outer
  ctx.declaringForm = declaringForm
  return ctx
}

const setNewLocal = (ctx, name) => {
  if (ctx.has(name)) return
  ctx.add(name)
}

const setNewLocalForm = (ctx, form) => {
  const name = getFormWord(form)
  // let curCtx = ctx.outer
  // while (curCtx) {
  //   if (curCtx.has(name)) throw new CompileError('redefining variable: ' + name, form)
  //   curCtx = curCtx.outer
  // }
  setNewLocal(ctx, name)
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
  let parametersForms = getFormList(tail[1])
  const bodies = tail.slice(2)
  const newCtx = makeCtx(ctx, 'func')
  setNewLocal(newCtx, name)
  let parameters
  let restOption = optionNone
  if (parametersForms.length >= 2 && getFormWord(parametersForms.at(-2)) === '..') {
    const restParam = parametersForms.at(-1)
    parametersForms = parametersForms.slice(0, -2)
    parametersForms.forEach((p) => setNewLocalForm(newCtx, p))
    parameters = parametersForms.map(getFormWord)
    setNewLocalForm(newCtx, restParam)
    restOption = makeOptionSome(getFormWord(restParam))
  } else {
    parameters = parametersForms.map(getFormWord)
    parametersForms.forEach((p) => setNewLocalForm(newCtx, p))
  }
  const arrow = jsArrowStmt(parameters, restOption, jsBlock(bodiesToStmts(defEnv, newCtx, bodies, true)))
  return jsIIFE([jsConstDecl(name, arrow), jsReturn(jsVar(name))])
}

const expSpecialFormsExp = {
  i32: (tail) => {
    if (tail.length !== 1) throw new CompileError('i32 expected one argument')
    try {
      return jsNumber(wordToI32(getFormWord(tail[0])))
    } catch (e) {
      if (e instanceof CompileError) throw e
      throw new CompileError(e.message, tail[0])
    }
  },
  i64: () => { throw new CompileError('i64 not implemented') },
  f32: () => { throw new CompileError('i64 not implemented') },
  f64: (tail) => {
    if (tail.length !== 1) throw new CompileError('f64 expected one argument')
    const v = +getFormWord(tail[0])
    if (isNaN(v)) throw new CompileError('expected number')
    return jsNumber(v)
  },
  word: (tail) => {
    if (tail.length !== 1) throw new CompileError('word expected one argument')
    return jsString(getFormWord(tail[0]))
  },
  intrinsic: (tail, ctx, defEnv) => {
    if (tail.length < 1) throw new CompileError('intrinsic expected at least one argument')
    const [opForm, ...args] = tail
    const opName = getFormWord(opForm)
    const getMemLval = (arrayName, byteSize) => {
      const [memForm, offsetForm, alignmentForm, addrForm] = args
      const memName = getFormWord(memForm)
      const memDesc = defEnv.get(memName)
      if (!memDesc) throw new CompileError('undefined memory')
      if (memDesc.defKind !== 'memory') throw new CompileError('not a memory')
      const offset = +getFormWord(offsetForm)
      if (isNaN(offset)) throw new CompileError('expected number')
      const alignment = +getFormWord(alignmentForm)
      if (isNaN(alignment)) throw new CompileError('expected number')
      const arrayExp = jsNew(jsCall(jsVar(arrayName), [jsSubscript(jsVar(memName), jsString('buffer'))]))
      let addrExp = jsAdd(jsNumber(offset), compExp(ctx, addrForm, defEnv))
      // need to divide by byteSize
      if (byteSize !== 1) addrExp = jsBin('div')(addrExp, jsNumber(byteSize))
      return jsSubscript(arrayExp, addrExp)
    }
    switch (opName) {
      case 'i32.load': {
        if (args.length !== 4) throw new CompileError('i32.load expected four arguments')
        return getMemLval('Int32Array', 4)
      }
      case 'i32.load8-u': {
        if (args.length !== 4) throw new CompileError('i32.load8-u expected four arguments')
        return getMemLval('UInt8Array', 1)
      }
      case 'i32.store8': {
        if (args.length !== 5) throw new CompileError('i32.store8 expected five arguments')
        const [, , , , valueForm] = args
        const jsExp = jsAssignExp(getMemLval('Int8Array', 1), compExp(ctx, valueForm, defEnv))
        return jsParenComma([jsExp, jsUndefined])
      }
      case 'i32.store': {
        if (args.length !== 5) throw new CompileError('i32.store expected five arguments')
        const [, , , , valueForm] = args
        const jsExp = jsAssignExp(getMemLval('Int32Array', 4), compExp(ctx, valueForm, defEnv))
        return jsParenComma([jsExp, jsUndefined])
      }
    }
    if (!intrinsics[opName]) throw new CompileError('undefined intrinsic: ' + opName)
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

let tmpVarCounter = 0

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
      setNewLocalForm(newCtx, bindings[i])
      const cexp = compExp(newCtx, bindings[i + 1], defEnv)
      stmts.push(isRedef ? jsAssign(varName, cexp) : jsLetDecl(varName, cexp))
    }
    stmts.push(...bodiesToStmts(defEnv, newCtx, bodies, isTailPos))
    return jsBlock(stmts)
  },
  letfn: (tail, ctx, defEnv, isTailPos) => {
    if (tail.length < 1) throw new CompileError('letfn expected at least a binding list')
    const [bindingForm, ...bodies] = tail
    const funcFormList = getFormList(bindingForm)
    const newCtx = makeCtx(ctx, 'letfn')
    const indexes = funcFormList.map((funcForm) => {
      const [firstFuncForm, ...rest] = getFormList(funcForm)
      if (getFormWord(firstFuncForm) !== 'func') throw new CompileError('expected func')
      const fname = getFormWord(rest[0])
      const isRedef = newCtx.has(fname)
      setNewLocalForm(newCtx, rest[0])
      return [fname, rest, isRedef]
    })
    const stmts = []
    for (const [fname, rest, isRedef] of indexes) {
      const funcInst = compFunc(rest, newCtx, defEnv)
      stmts.push(isRedef ? jsAssign(fname, funcInst) : jsLetDecl(fname, funcInst))
    }
    stmts.push(...bodiesToStmts(defEnv, newCtx, bodies, isTailPos))
    return jsBlock(stmts)
  },
  loop: (tail, ctx, defEnv) => {
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
      setNewLocalForm(newCtx, bindings[i])
      initStmts.push(isRedef ? jsAssign(varName, cexp) : jsLetDecl(varName, cexp))
    }
    const bodyStmts = bodiesToStmts(defEnv, newCtx, bodies, true)
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
    if (forms.length === 0) throw new CompileError('match expected at least one argument')
    const lctxMatch = makeCtx(lctx, 'match')

    const stmts = []
    const tmpValueVarName = 'matchValue' + tmpVarCounter++
    setNewLocal(lctxMatch, tmpValueVarName)
    const cvalue = compExp(lctxMatch, forms[0], defEnv)
    stmts.push(jsConstDecl(tmpValueVarName, cvalue))
    const tmpArgsVar = 'matchValueArgs' + tmpVarCounter++
    setNewLocal(lctxMatch, tmpArgsVar)
    stmts.push(jsConstDecl(tmpArgsVar, jsSubscript(jsVar(tmpValueVarName), jsString('args'))))

    const cases = []
    for (let i = 1; i < forms.length - 1; i += 2) {
      const patternList = getFormList(forms[i])
      if (patternList.length === 0) throw new CompileError('pattern must have at least one word', forms[i])
      const tag = getFormWord(patternList[0])
      const brach = forms[i + 1]
      const newCtx = makeCtx(lctxMatch, 'match-case')
      const branchStmts = []
      for (let j = 1; j < patternList.length; j++) {
        const patternWord = getFormWord(patternList[j])
        setNewLocalForm(newCtx, patternList[j])
        branchStmts.push(jsConstDecl(patternWord, jsSubscript(jsVar(tmpArgsVar), jsNumber(j - 1))))
      }
      branchStmts.push(compExpStmt(newCtx, brach, defEnv, true))
      cases.push({ fst: [jsString(tag)], snd: jsBlock(branchStmts) })
    }

    const defaultCase =
      forms.length % 2 === 0
        ? compExpStmt(lctx, forms.at(-1), defEnv, true)
        : jsThrow(jsNew(jsCall(jsVar('Error'), [jsString('no match string')])))
    const theSwitch = jsSwitch(jsSubscript(jsVar(tmpValueVarName), jsString('tag')), cases, defaultCase)
    stmts.push(theSwitch)
    return jsBlock(stmts)
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
      if (stmtSpecialHandler) {
        const stmt = stmtSpecialHandler(args, ctx, defEnv, isTail)
        return isTail ? stmt : jsExpStmt(jsIIFE([stmt]))
      }
      const expSpecialHandler = expSpecialFormsExp[firstWord]
      if (expSpecialHandler) {
        const exp = expSpecialHandler(args, ctx, defEnv)
        return isTail ? jsReturn(exp) : jsExpStmt(exp)
      }
      const desc = defEnv.get(firstWord)
      if (desc && desc.defKind === 'defmacro') return compExpStmt(ctx, desc.value(...args), defEnv, isTail)
    }
  }
  const jsExp = compExp(ctx, form, defEnv)
  return isTail ? jsReturn(jsExp) : jsExpStmt(jsExp)
}

const formToQuotedJS = (form) => {
  const w = tryGetFormWord(form)
  if (w) return mkTaggedObject('form/word', jsString(w))
  const forms = tryGetFormList(form)
  if (!forms) throw new CompileError('unexpected form')
  return mkTaggedObject('form/list', jsArray(forms.map(formToQuotedJS)))
}

const jsStmtToStringSafe = (js) => {
  try {
    return jsStmtToString(js)
  } catch (e) {
    console.error(e)
    console.dir(js, { depth: null })
    // return '/* error in jsStmtToStringSafe */'
    throw e
  }
}

const jsExpToStringSafe = (js) => {
  try {
    return jsExpToString(js)
  } catch (e) {
    console.error(e)
    console.dir(js, { depth: null })
    // return '/* error in jsExpToStringSafe */'
    throw e
  }
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
    if (!desc) throw new CompileError('undefined variable: ' + word, form)
    const { defKind } = desc
    if (defKind === 'defmacro') throw new CompileError('macro in value position')
    if (defKind === 'defexpr') throw new CompileError('fexpr in value position')
    return jsVar(word)
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
    if (firstWord === 'do') return jsIIFE(bodiesToStmts(defEnv, ctx, args, true))
    if (firstWord in topSpecialForms) throw new CompileError('top special not allowed in expression form')

    const expSpecialHandler = expSpecialFormsExp[firstWord]
    if (expSpecialHandler) return expSpecialHandler(args, ctx, defEnv)

    const stmtSpecialHandler = expSpecialFormsStmt[firstWord]
    if (stmtSpecialHandler) return jsIIFE([stmtSpecialHandler(args, ctx, defEnv, true)])

    const defDesc = defEnv.get(firstWord)
    if (defDesc) {
      const { defKind, value } = defDesc
      switch (defKind) {
        case 'defmacro':
          return compExp(ctx, value(...args), defEnv)
        case 'defexpr':
          return jsCall(jsVar(firstWord), args.map(formToQuotedJS))
        default:
          break
      }
    }
  }
  return jsCall(
    compExp(ctx, firstForm, defEnv),
    args.map((arg) => compExp(ctx, arg, defEnv)),
  )
}

const importModuleElement = async (modulePath, elementName) => {
  if (!modulePath.startsWith('./runtime-lib/')) throw new Error('invalid module name: ' + modulePath)
  if (!modulePath.endsWith('.js')) throw new Error('invalid module name: ' + modulePath)
  const moduleName = modulePath.slice(14, -3)
  const module = await import(`./runtime-lib/${moduleName}.js`)
  const elem = module[elementName]
  if (elem === undefined) throw new Error('imported value not found in module ' + modulePath + ' ' + elementName)
  return elem
}

const AsyncFunction = async function () {}.constructor

const evalExpAsync = async (defEnv, jsExp) => {
  const jsSrc = jsExpToStringSafe(jsExp)
  try {
    const asyncFunc = new AsyncFunction('dynImport', ...[...defEnv.keys()].map(escapeIdentifier), 'return ' + jsSrc)
    return await asyncFunc(importModuleElement, ...[...defEnv.values()].map(({ value }) => value))
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof ReferenceError || e instanceof RangeError) {
      console.error(e)
      console.error(jsSrc)
      console.dir(jsExp, { depth: null })
      throw new CompileError('SyntaxError in evalExpAsync')
    }
    throw e
  }
}

const setDef = async (defEnv, varName, defKind, jsExp) => {
  if (defEnv.has(varName)) throw new CompileError('redefining variable: ' + varName)
  try {
    const value = await evalExpAsync(defEnv, jsExp)
    defEnv.set(varName, { defKind, value })
  } catch (e) {
    console.error({ varName, defKind })
    console.error(e)
    throw e
  }
}

const defFuncLike = async (firstWord, tail, defEnv) => {
  const defName = getFormWord(tail[0])
  const exp = compFunc(tail, null, defEnv)
  await setDef(defEnv, defName, firstWord, exp)
}
import { 'read-file-async' as read_file_async } from './runtime-lib/files.js'

const topSpecialForms = {
  def: async (_, tail, defEnv) => {
    if (tail.length !== 2) throw new CompileError('def expected two arguments')
    const varName = getFormWord(tail[0])
    const jsExp = compExp(null, tail[1], defEnv)
    await setDef(defEnv, varName, 'def', jsExp)
  },
  defn: defFuncLike,
  defexpr: defFuncLike,
  defmacro: defFuncLike,
  do: async (_, tail, defEnv) => {
    for (const form of tail) await compileTopDefEnv(defEnv, form)
  },
  load: async (_, tail, defEnv) => {
    if (tail.length !== 1) throw new CompileError('load expects one argument')
    const relativeFilePath = getFormWord(tail[0])
    const fileContent = await read_file_async(relativeFilePath)
    const fileForms = parseString(fileContent, relativeFilePath)
    for (const form of fileForms) await compileTopDefEnv(defEnv, form)
  },
  type: async (_, forms, defEnv) => {
    if (forms.length % 3 !== 0) throw new CompileError('type expected triples')
    for (let i = 0; i < forms.length; i += 3) {
      const type = getFormWord(forms[i])
      const _typeParams = getFormList(forms[i + 1]).map(getFormWord)
      const body = getFormList(forms[i + 2])
      const firstBodyWord = getFormWord(body[0])
      const typePrefix = `${type}/`
      switch (firstBodyWord) {
        case 'union': {
          for (let i = 1; i < body.length; i++) {
            const unionCase = getFormList(body[i])
            if (unionCase.length === 0) throw new CompileError('union case must have at least one word')
            const unionCaseName = getFormWord(unionCase[0])
            const qualName = typePrefix + unionCaseName
            const parameters = unionCase.slice(1).map((_, i) => `p${i}`)
            const ctor = jsArrowExpNoRest(parameters, mkTaggedObject(qualName, ...parameters.map((p) => jsVar(p))))
            await setDef(defEnv, qualName, 'unionCtor', ctor)
          }
          break
        }
        case 'record': {
          const fieldNames = []
          for (let i = 1; i < body.length; i++) {
            const recordField = getFormList(body[i])
            if (recordField.length < 2) throw new CompileError('record field must have a name and a type')
            const fieldName = getFormWord(recordField[0])
            fieldNames.push(fieldName)
            const projecterName = typePrefix + fieldName
            const jsProjecter = jsArrowExpNoRest(['record'], jsSubscript(jsVar('record'), jsString(fieldName)))
            await setDef(defEnv, projecterName, 'recordProj', jsProjecter)
          }
          const jsConstructor = jsArrowExpNoRest(fieldNames, mkObject(...fieldNames.map((f) => [f, jsVar(f)])))
          await setDef(defEnv, type, 'recordCtor', jsConstructor)
          break
        }
        default:
          throw new CompileError('unexpected type body: ' + firstBodyWord)
      }
    }
  },
  export: (_, forms, defEnv) => {
    for (const form of forms) {
      const exportWord = getFormWord(form)
      if (!defEnv.has(exportWord)) throw new CompileError('exported def variable not found: ' + exportWord, form)
    }
  },
  import: async (_, tail, defEnv) => {
    if (tail.length !== 3) throw new CompileError('import expects three arguments')
    const importModuleName = getFormWord(tail[0])
    const importElementName = getFormWord(tail[1])
    const jsExp = jsAwait(jsCall(jsVar('dynImport'), [jsString(importModuleName), jsString(importElementName)]))
    await setDef(defEnv, importElementName, 'import', jsExp)
  },
  memory: async (_, tail, defEnv) => {
    const [memoryName, memorySize] = tail.map(getFormWord)
    const initialSize = +memorySize
    if (initialSize <= 0) throw new CompileError('memory size must be positive')
    if ((initialSize !== initialSize) | 0) throw new CompileError('memory size must be an integer')
    const jsMemDesc = mkObject(['initial', jsNumber(initialSize)])
    const jsExp = jsNew(jsCall(jsSubscript(jsVar('WebAssembly'), jsString('Memory')), [jsMemDesc]))
    await setDef(defEnv, memoryName, 'memory', jsExp)
  },
}

const compileTopDefEnv = async (defEnv, form) => {
  const forms = tryGetFormList(form)
  if (forms && forms.length > 0) {
    const [firstForm, ...args] = forms
    const firstWord = tryGetFormWord(firstForm)
    if (firstWord) {
      const topSpecialHandler = topSpecialForms[firstWord]
      if (topSpecialHandler) {
        await topSpecialHandler(firstWord, args, defEnv)
        return null
      }
    }
    const defDesc = defEnv.get(firstWord)
    if (defDesc && defDesc.defKind === 'defmacro') return await compileTopDefEnv(defEnv, defDesc.value(...args))
  }
  return compExp(null, form, defEnv)
}

export const specialForms = Object.freeze([
  ...new Set([
    ...Object.keys(expSpecialFormsExp),
    ...Object.keys(expSpecialFormsStmt),
    ...Object.keys(topSpecialForms),
  ]),
])

export const makeJSCompilingEvaluator = () => {
  const defEnv = new Map()
  const evalExp = (form) => {
    const ce = compExpStmt(null, form, defEnv, true)
    const f = new Function(jsStmtToStringSafe(ce))
    return f()
  }
  const evalTop = async (form) => {
    const optJsExp = await compileTopDefEnv(defEnv, form)
    if (optJsExp === null) return
    if (optJsExp) return await evalExpAsync(defEnv, optJsExp)
  }
  const evalTops = async (forms) => {
    let optJsExp = null
    for (const form of forms) optJsExp = await compileTopDefEnv(defEnv, form)
    if (optJsExp !== null) return await evalExpAsync(defEnv, optJsExp)
  }
  const evalTopsExp = async (forms) => {
    if (forms.length === 0) throw new CompileError('empty list')
    for (let i = 0; i < forms.length - 1; i++) await compileTopDefEnv(defEnv, forms[i])
    const lastForm = forms.at(-1)
    const jsExp = compExp(null, lastForm, defEnv)
    return await evalExpAsync(defEnv, jsExp)
  }
  const getDef = (name) => {
    const desc = defEnv.get(name)
    if (desc) return desc.value
  }
  const getDefKind = (name) => {
    const desc = defEnv.get(name)
    if (desc) return desc.defKind
  }
  const getDefNames = () => defEnv.keys()
  const tryGetMacro = (name) => {
    const desc = defEnv.get(name)
    if (desc && desc.defKind === 'defmacro') return desc.value
  }
  return { evalExp, evalTop, evalTopsExp, evalTops, getDef, getDefKind, getDefNames, tryGetMacro }
}
