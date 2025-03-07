import {
  tryGetFormList,
  tryGetFormWord,
  optionNone,
  makeOptionSome,
  makeTaggedValue,
  parseString,
  wordToI32,
  getLocationFromForm,
} from './core.js'
import { intrinsicsInfo } from './intrinsics.js'
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
const jsBigInt = jsExp('bigint')
const jsString = jsExp('string')
const jsBinop = jsExp('binop')
const jsBin = (s) => (a, b) => jsBinop(makeTaggedValue('binop/' + s), a, b)
const jsBinDirect = (op, a, b) => jsExp('binop-direct')(op, a, b)
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

const jsOr0 = (exp) => jsBinIOr(exp, js0)

export class CompileError extends Error {
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
  if (!(outer === null || outer instanceof Map)) throw new Error('makeCtx expects null or a context')
  const ctx = new Map()
  ctx.outer = outer
  ctx.declaringForm = declaringForm
  return ctx
}

const setNewLocal = (ctx, name, desc) => {
  if (ctx.has(name)) return
  ctx.set(name, desc)
}

const setNewLocalForm = (ctx, form, desc) => {
  const name = getFormWord(form)
  // let curCtx = ctx.outer
  // while (curCtx) {
  //   if (curCtx.has(name)) throw new CompileError('redefining variable: ' + name, form)
  //   curCtx = curCtx.outer
  // }
  setNewLocal(ctx, name, desc)
}

const compBodiesToStmts = (defEnv, ctx, tail, isTail) => {
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

const parseParameterForm = (form) => {
  const parameters = getFormList(form)
  if (parameters.length < 2 || getFormWord(parameters.at(-2)) !== '..') return { parameters }
  const restParam = parameters.at(-1)
  return { parameters: parameters.slice(0, -2), restParam }
}

const compFunc = (tail, ctx, topContext) => {
  const name = getFormWord(tail[0])
  const bodies = tail.slice(2)
  const newCtx = makeCtx(ctx, 'func')
  const paramDesc = parseParameterForm(tail[1])
  const { parameters, restParam } = paramDesc
  setNewLocalForm(newCtx, tail[0], { kind: 'func-recur', paramDesc })
  const jsParameters = parameters.map((pf) => {
    setNewLocalForm(newCtx, pf, { kind: 'param' })
    return getFormWord(pf)
  })
  let restOption = optionNone
  if (restParam) {
    setNewLocalForm(newCtx, restParam, { kind: 'rest-param' })
    restOption = makeOptionSome(getFormWord(restParam))
  }
  const arrow = jsArrowStmt(jsParameters, restOption, jsBlock(compBodiesToStmts(topContext, newCtx, bodies, true)))
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
  bigint: (tail) => {
    if (tail.length !== 1) throw new CompileError('bigint expected one argument')
    try {
      return jsBigInt(BigInt(getFormWord(tail[0])))
    } catch (e) {
      if (e instanceof CompileError) throw e
      throw new CompileError(e.message, tail[0])
    }
  },
  f64: (tail) => {
    if (tail.length !== 1) throw new CompileError('f64 expected one argument')
    const v = +getFormWord(tail[0])
    if (isNaN(v)) throw new CompileError('expected number')
    const stringNum = v.toPrecision(21)
    const normalized = parseFloat(stringNum)
    if (normalized !== v) throw new CompileError('f64 precision loss')
    return jsNumber(v)
  },
  word: (tail) => {
    if (tail.length !== 1) throw new CompileError('word expected one argument')
    return jsString(getFormWord(tail[0]))
  },
  intrinsic: (tail, ctx, topContext) => {
    if (tail.length < 1) throw new CompileError('intrinsic expected at least one argument')
    const [opForm, ...args] = tail
    const opName = getFormWord(opForm)
    const binIntrinsicInfo = intrinsicsInfo[opName]
    if (!binIntrinsicInfo) throw new CompileError('unknown intrinsic: ' + opName)
    const { op, orZero } = binIntrinsicInfo
    if (args.length !== 2) throw new CompileError(opName + ' expected two arguments')
    const inst = jsBinDirect(op, compExp(ctx, args[0], topContext), compExp(ctx, args[1], topContext))
    return orZero ? jsOr0(inst) : inst
  },
  func: compFunc,
  if: (tail, ctx, defEnv) => {
    if (tail.length !== 3) throw new CompileError('if expected three arguments')
    return jsTernary(...tail.map((f) => compExp(ctx, f, defEnv)))
  },
  tuple: (tail, ctx, defEnv) => jsArray(tail.map((f) => compExp(ctx, f, defEnv))),
}
Object.freeze(expSpecialFormsExp)

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
    stmts.push(...compBodiesToStmts(defEnv, newCtx, bodies, isTailPos))
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
      const paramDesc = parseParameterForm(rest[1])
      setNewLocalForm(newCtx, rest[0], { kind: 'func-recur', paramDesc })
      return [fname, rest, isRedef]
    })
    const stmts = []
    for (const [fname, rest, isRedef] of indexes) {
      const funcInst = compFunc(rest, newCtx, defEnv)
      stmts.push(isRedef ? jsAssign(fname, funcInst) : jsLetDecl(fname, funcInst))
    }
    stmts.push(...compBodiesToStmts(defEnv, newCtx, bodies, isTailPos))
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
    const bodyStmts = compBodiesToStmts(defEnv, newCtx, bodies, true)
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
  do: (tail, ctx, defEnv, isTailPos) => jsSeq(compBodiesToStmts(defEnv, ctx, tail, isTailPos)),
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
    const location = getLocationFromForm(forms[0])
    const defaultCase =
      forms.length % 2 === 0
        ? compExpStmt(lctx, forms.at(-1), defEnv, true)
        : jsThrow(jsNew(jsCall(jsVar('Error'), [jsString('no match string: ' + location)])))
    const theSwitch = jsSwitch(jsSubscript(jsVar(tmpValueVarName), jsString('tag')), cases, defaultCase)
    stmts.push(theSwitch)
    return jsBlock(stmts)
  },
}
Object.freeze(expSpecialFormsStmt)

const isSpecialForm = (word) => word in expSpecialFormsExp || word in expSpecialFormsStmt

const tryRunStmtHandler = (firstForm, args, lctx, topContext, isTail) => {
  const handler = expSpecialFormsStmt[tryGetFormWord(firstForm)]
  if (!handler) return null
  try {
    return handler(args, lctx, topContext, isTail)
  } catch (e) {
    if (e instanceof CompileError && !e.form) e.form = firstForm
    throw e
  }
}

const tryRunExpHandler = (firstForm, args, lctx, topContext) => {
  const handler = expSpecialFormsExp[tryGetFormWord(firstForm)]
  if (!handler) return null
  try {
    return handler(args, lctx, topContext)
  } catch (e) {
    if (e instanceof CompileError && !e.form) e.form = firstForm
    throw e
  }
}

const tryGetWordFirst = (form) => {
  const forms = tryGetFormList(form)
  if (!forms || forms.length === 0) return null
  const word = tryGetFormWord(forms[0])
  if (!word) return null
  return { firstWord: word, args: forms.slice(1) }
}

const compExpStmt = (lctx, form, topContext, isTail) => {
  const wordFirstForm = tryGetWordFirst(form)
  if (wordFirstForm) {
    const { firstWord, args } = wordFirstForm
    try {
      const firstForm = tryGetFormList(form)[0]
      const stmt = tryRunStmtHandler(firstForm, args, lctx, topContext, isTail)
      if (stmt) return isTail ? stmt : jsExpStmt(jsIIFE([stmt]))

      const exp = tryRunExpHandler(firstForm, args, lctx, topContext)
      if (exp) return isTail ? jsReturn(exp) : jsExpStmt(exp)

      const desc = topContext.defEnv.get(firstWord)
      if (desc && desc.defKind === 'defmacro') {
        const macroResult = desc.value(...args)
        try {
          return compExpStmt(lctx, macroResult, topContext, isTail)
        } catch (e) {
          if (e instanceof CompileError) throw e
          throw new CompileError('failed to compile macro result to expression statement', form)
        }
      }
    } catch (e) {
      if (e instanceof CompileError && !e.form) e.form = form
      throw e
    }
  }
  const jsExp = compExp(lctx, form, topContext)
  return isTail ? jsReturn(jsExp) : jsExpStmt(jsExp)
}

const formToQuotedJS = (form) => {
  const w = tryGetFormWord(form)
  if (w) return mkTaggedObject('form/word', jsString(w))
  const forms = tryGetFormList(form)
  if (!forms) throw new Error('unexpected form', { cause: form })
  return mkTaggedObject('form/list', jsArray(forms.map(formToQuotedJS)))
}

const compExp = (ctx, form, topContext) => {
  const word = tryGetFormWord(form)
  if (word) {
    let curCtx = ctx
    while (curCtx) {
      if (curCtx.has(word)) return jsVar(word)
      curCtx = curCtx.outer
    }
    const desc = topContext.defEnv.get(word)
    if (!desc) throw new CompileError('undefined variable: ' + word, form)
    const { defKind } = desc
    if (defKind === 'defmacro') throw new CompileError('macro in value position', form)
    if (defKind === 'defexpr') throw new CompileError('fexpr in value position', form)
    return jsVar(word)
  }
  const forms = tryGetFormList(form)
  if (!forms) {
    // here we throw an Error not an CompileError as the input is not a form
    throw new Error('expected a valid form value', { cause: form })
  }
  if (forms.length === 0) throw new CompileError('empty list', form)

  const wordFirstForm = tryGetWordFirst(form)
  if (wordFirstForm) {
    const { firstWord, args } = wordFirstForm
    try {
      if (firstWord === 'do') return jsIIFE(compBodiesToStmts(topContext, ctx, args, true))
      if (firstWord in topSpecialForms) throw new CompileError('top special not allowed in expression form', form)

      const firstForm = forms[0]
      const exp = tryRunExpHandler(firstForm, args, ctx, topContext)
      if (exp) return exp

      const stmt = tryRunStmtHandler(firstForm, args, ctx, topContext, true)
      if (stmt) return jsIIFE([stmt])

      const numOfArgs = args.length
      const checkArity = ({ parameters, restParam }) => {
        if (numOfArgs < parameters.length) throw new CompileError('not enough arguments', form)
        if (!restParam && numOfArgs > parameters.length)
          throw new CompileError('too many arguments: ' + firstWord + ' ' + parameters.length + ' ' + numOfArgs, form)
      }

      let curCtx = ctx
      while (curCtx) {
        if (curCtx.has(firstWord)) {
          const ldesc = curCtx.get(firstWord)
          if (ldesc) {
            if (ldesc.kind === 'func-recur') checkArity(ldesc.paramDesc)
            return jsCall(
              compExp(ctx, forms[0], topContext),
              forms.slice(1).map((arg) => compExp(ctx, arg, topContext)),
            )
          }
        }
        curCtx = curCtx.outer
      }

      const defDesc = topContext.defEnv.get(firstWord)
      if (defDesc) {
        const { defKind, value, paramDesc } = defDesc
        if (paramDesc) checkArity(paramDesc)
        switch (defKind) {
          case 'defmacro': {
            const macroForm = value(...args)
            try {
              return compExp(ctx, macroForm, topContext)
            } catch (e) {
              if (e instanceof CompileError) throw e
              throw new CompileError('failed to compile macro result to expression', form)
            }
          }
          case 'defexpr':
            return jsCall(jsVar(firstWord), args.map(formToQuotedJS))
          default:
            break
        }
      }
    } catch (e) {
      if (e instanceof CompileError && !e.form) e.form = form
      throw e
    }
  }
  return jsCall(
    compExp(ctx, forms[0], topContext),
    forms.slice(1).map((arg) => compExp(ctx, arg, topContext)),
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

const jsStmtToStringSafe = (js) => {
  try {
    const src = jsStmtToString(js)
    return src
  } catch (e) {
    console.error(e)
    console.dir(js, { depth: null })
    // return '/* error in jsStmtToStringSafe */'
    throw e
  }
}

const jsExpToStringSafe = (js) => {
  try {
    const src = jsExpToString(js)
    return src
  } catch (e) {
    console.error(e)
    console.dir(js, { depth: null })
    // return '/* error in jsExpToStringSafe */'
    throw e
  }
}

const AsyncFunction = async function () {}.constructor

const evalExpAsync = async (topContext, jsExp) => {
  const { defEnv } = topContext
  const jsSrc = jsExpToStringSafe(jsExp)
  try {
    const asyncFunc = new AsyncFunction('dynImport', ...[...defEnv.keys()].map(escapeIdentifier), 'return ' + jsSrc)
    return await asyncFunc(importModuleElement, ...[...defEnv.values()].map(({ value }) => value))
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof ReferenceError || e instanceof RangeError) {
      console.error(e)
      console.error(jsSrc)
      console.dir(jsExp, { depth: null })
      throw new CompileError(e.constructor.name + ' in evalExpAsync: ' + e.message)
    }
    throw e
  }
}

const setDef = async (topContext, varName, defKind, jsExp) => {
  if (isSpecialForm(varName)) throw new CompileError('redefining special form: ' + varName)
  const { defEnv } = topContext
  if (defEnv.has(varName)) throw new CompileError('redefining variable: ' + varName)
  try {
    const value = await evalExpAsync(topContext, jsExp)
    const defDesc = { defKind, value }
    defEnv.set(varName, defDesc)
    return defDesc
  } catch (e) {
    console.error({ varName, defKind })
    console.error(e)
    throw e
  }
}

const defFuncLike = async (firstWord, tail, topContext) => {
  const defName = getFormWord(tail[0])
  const exp = compFunc(tail, null, topContext)
  const defDesc = await setDef(topContext, defName, firstWord, exp)
  defDesc.paramDesc = parseParameterForm(tail[1])
}
import { 'read-file-async' as read_file_async } from './runtime-lib/files.js'

const topSpecialForms = {
  def: async (_, tail, topContext) => {
    if (tail.length !== 2) throw new CompileError('def expected two arguments')
    const varName = getFormWord(tail[0])
    const jsExp = compExp(null, tail[1], topContext)
    await setDef(topContext, varName, 'def', jsExp)
  },
  defn: defFuncLike,
  defexpr: defFuncLike,
  defmacro: defFuncLike,
  do: async (_, tail, topContext) => {
    for (const form of tail) await compileTopDefEnv(topContext, form)
  },
  load: async (_, tail, topContext) => {
    if (tail.length !== 1) throw new CompileError('load expects one argument')
    const relativeFilePath = getFormWord(tail[0])
    const fileContent = await read_file_async(relativeFilePath)
    const fileForms = parseString(fileContent, relativeFilePath)
    for (const form of fileForms) await compileTopDefEnv(topContext, form)
  },
  // we can make the type special form generate code that creates a tagged object with the type name and the type body
  type: async (_, forms, topContext) => {
    const { typeContext } = topContext
    if (forms.length % 3 !== 0) throw new CompileError('type expected triples')
    for (let i = 0; i < forms.length; i += 3) {
      const typeName = getFormWord(forms[i])
      const typeParams = getFormList(forms[i + 1]).map(getFormWord)
      if (typeContext.has(typeName)) throw new CompileError('redefining type: ' + typeName)
      typeContext.set(typeName, { params: typeParams })
    }
    for (let i = 0; i < forms.length; i += 3) {
      const typeName = getFormWord(forms[i])
      const descObj = typeContext.get(typeName)

      const body = getFormList(forms[i + 2])
      const typeKind = getFormWord(body[0])
      descObj.kind = typeKind
      const typePrefix = `${typeName}/`
      switch (typeKind) {
        case 'union': {
          const constructors = []
          for (let i = 1; i < body.length; i++) {
            const unionCase = getFormList(body[i])
            if (unionCase.length === 0) throw new CompileError('union case must have at least one word', body[i])
            const unionCaseName = getFormWord(unionCase[0])
            const qualName = typePrefix + unionCaseName
            const paramtypes = unionCase.slice(1)
            const parameters = paramtypes.map((_, i) => `p${i}`)
            const ctor = jsArrowExpNoRest(parameters, mkTaggedObject(qualName, ...parameters.map((p) => jsVar(p))))
            const defDesc = await setDef(topContext, qualName, 'unionCtor', ctor)
            defDesc.paramDesc = { parameters }
            constructors.push({ name: unionCaseName, params: paramtypes })
          }
          descObj.constructors = constructors
          break
        }
        case 'record': {
          const fieldNames = []
          const fields = []
          for (let i = 1; i < body.length; i++) {
            const recordField = getFormList(body[i])
            if (recordField.length != 2) throw new CompileError('record field must have a name and a type', body[i])
            const fieldName = getFormWord(recordField[0])
            fieldNames.push(fieldName)
            const projecterName = typePrefix + fieldName
            const jsProjecter = jsArrowExpNoRest(['record'], jsSubscript(jsVar('record'), jsString(fieldName)))
            await setDef(topContext, projecterName, 'recordProj', jsProjecter)
            const typeForm = recordField[1]
            fields.push({ name: fieldName, typeForm })
          }
          const jsConstructor = jsArrowExpNoRest(fieldNames, mkObject(...fieldNames.map((f) => [f, jsVar(f)])))
          await setDef(topContext, typeName, 'recordCtor', jsConstructor)
          descObj.fields = fields
          break
        }
        default:
          throw new CompileError('unexpected type body: ' + typeKind, body[0])
      }
    }
  },
  import: async (_, tail, topContext) => {
    if (tail.length !== 3) throw new CompileError('import expects three arguments')
    const importModuleName = getFormWord(tail[0])
    const importElementName = getFormWord(tail[1])
    const _importType = getFormList(tail[2])
    const jsExp = jsAwait(jsCall(jsVar('dynImport'), [jsString(importModuleName), jsString(importElementName)]))
    await setDef(topContext, importElementName, 'import', jsExp)
  },
}

const compileTopDefEnv = async (topContext, form) => {
  const { defEnv } = topContext
  const wordFirstForm = tryGetWordFirst(form)
  if (wordFirstForm) {
    const { firstWord, args } = wordFirstForm
    try {
      const topSpecialHandler = topSpecialForms[firstWord]
      if (topSpecialHandler) {
        await topSpecialHandler(firstWord, args, topContext)
        return null
      }
    } catch (e) {
      if (e instanceof CompileError && !e.form) e.form = form
      throw e
    }

    const defDesc = defEnv.get(firstWord)
    if (defDesc && defDesc.defKind === 'defmacro') {
      const { paramDesc } = defDesc
      const { parameters, restParam } = paramDesc
      const numOfArgs = args.length
      if (numOfArgs < parameters.length) throw new CompileError('not enough arguments', form)
      if (!restParam && numOfArgs > parameters.length) throw new CompileError('too many arguments', form)
      return await compileTopDefEnv(topContext, defDesc.value(...args))
    }
  }
  return compExp(null, form, topContext)
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
  const typeContext = new Map()
  const topContext = { defEnv, typeContext }
  const evalExp = (form) => {
    const ce = compExpStmt(null, form, topContext, true)
    const f = new Function(jsStmtToStringSafe(ce))
    return f()
  }
  const evalTop = async (form) => {
    try {
      const optJsExp = await compileTopDefEnv(topContext, form)
      if (optJsExp === null) return
      if (optJsExp) return await evalExpAsync(topContext, optJsExp)
    } catch (e) {
      if (e instanceof CompileError) {
        let errorForm = e.form
        if (!errorForm) errorForm = form
        const location = getLocationFromForm(errorForm)
        console.error(e.message, location)
        console.error(e)
        return
      }
      throw e
    }
  }
  const evalTops = async (forms) => {
    let result = null
    for (const form of forms) result = await evalTop(form)
    if (result !== null) return result
  }
  const evalTopsExp = async (forms) => {
    if (forms.length === 0) throw new Error('no forms to evaluate')
    for (let i = 0; i < forms.length - 1; i++) await compileTopDefEnv(topContext, forms[i])
    const lastForm = forms.at(-1)
    const jsExp = compExp(null, lastForm, topContext)
    return await evalExpAsync(topContext, jsExp)
  }
  const getDef = (name) => {
    const desc = defEnv.get(name)
    if (desc) return desc.value
    throw new Error('def not found: ' + name)
  }
  const getDefKind = (name) => {
    const desc = defEnv.get(name)
    if (desc) return desc.defKind
  }
  const getDefNames = () => defEnv.keys()
  const tryGetMacro = (name) => {
    const desc = defEnv.get(name)
    if (desc && desc.defKind === 'defmacro') return desc.value
    return null
  }
  return { evalExp, evalTop, evalTopsExp, evalTops, getDef, getDefKind, getDefNames, tryGetMacro }
}
