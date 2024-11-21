import {
  tryGetFormList,
  tryGetFormWord,
  optionNone,
  makeOptionSome,
  makeTaggedValue,
  parseString,
  wordToI32,
  makeFormList,
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
const js4 = jsNumber(4)
const jsUndefined = jsVar('undefined')
const jsMathMax = jsSubscript(jsVar('Math'), jsString('max'))

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

const opIntrinsicCall = (opName, args) => {
  switch (opName) {
    case 'i32.add':
      return jsOr0(jsAdd(...args))
    case 'i32.sub':
      return jsOr0(jsSub(...args))
    case 'i32.mul':
      return jsOr0(jsBin('mul')(...args))
    case 'i32.div-s':
      return jsOr0(jsBin('div')(...args))
    case 'i32.rem-s':
      return jsOr0(jsBin('rem')(...args))
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
      return jsOr0(jsBin('eq')(...args))
    case 'i32.lt-s':
      return jsOr0(jsBin('lt')(...args))
    case 'i32.le-s':
      return jsOr0(jsBin('le')(...args))

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

const parseParameterForm = (form) => {
  const parameters = getFormList(form)
  if (parameters.length < 2 || getFormWord(parameters.at(-2)) !== '..') return { parameters }
  const restParam = parameters.at(-1)
  return { parameters: parameters.slice(0, -2), restParam }
}

const compFunc = (tail, ctx, topContext) => {
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
  const arrow = jsArrowStmt(parameters, restOption, jsBlock(bodiesToStmts(topContext, newCtx, bodies, true)))
  return jsIIFE([jsConstDecl(name, arrow), jsReturn(jsVar(name))])
}

const builtInPrimitiveTypeSizes = Object.freeze({
  i8: 1,
  u8: 1,
  i16: 2,
  u16: 2,
  i32: 4,
  i64: 8,
  f32: 4,
  f64: 8,
  v128: 16,
})

const typeVar = (name) => Object.freeze({ typeKind: 'var', name })
const typeInst = (typeName, ...args) => Object.freeze({ typeKind: 'inst', typeName, args })
const typeExp = (exp) => Object.freeze({ typeKind: 'exp', exp })
const typeFunc = (parameters, restParameter, result) =>
  Object.freeze({ typeKind: 'func', parameters, restParameter, result })

const makeTypeValidator = (typeContext, params) => {
  const subst = new Set(params)
  const go = (typeForm) => {
    {
      const typeWord = tryGetFormWord(typeForm)
      if (typeWord) {
        if (subst.has(typeWord)) return typeVar(typeWord)
        return go(makeFormList([typeForm]))
      }
    }
    const typeList = getFormList(typeForm)
    if (typeList.length === 0) throw new CompileError('empty type list')
    const [first, ...rest] = typeList
    const firstWord = getFormWord(first)
    if (firstWord in builtInPrimitiveTypeSizes) {
      if (rest.length !== 0) throw new CompileError('built-in type expected no arguments')
      return typeInst(firstWord)
    }
    switch (firstWord) {
      case 'word':
      case 'any':
        if (rest.length !== 0) throw new CompileError('expected no arguments')
        return typeInst(firstWord)
      case 'list':
      case 'pointer': {
        if (rest.length !== 1) throw new CompileError('expected one argument')
        return typeInst(firstWord, go(rest[0]))
      }
      case 'exp': {
        if (rest.length !== 1) throw new CompileError('exp expected one argument')
        return typeExp(rest[0])
      }
      case 'array': {
        if (rest.length !== 2) throw new CompileError('array expected two arguments')
        const [elementTypeForm, sizeForm] = rest
        const elementType = go(elementTypeForm)
        const size = go(sizeForm)
        if (Array.isArray(size) && size[0] !== 'exp') throw new CompileError('array size must be exp type')
        return typeInst('array', elementType, size)
      }
      case 'func': {
        if (rest.length < 2) throw new CompileError('func expected at least two arguments')
        const [paramsForm, returnTypeForm] = rest
        const params = getFormList(paramsForm)
        if (params.length > 1 && tryGetFormWord(params.at(-2)) === '..')
          throw new CompileError('rest parameter not implemented')
        const returnType = go(returnTypeForm)
        return typeFunc(params.map(go), null, returnType)
      }
      case 'tuple':
        return typeInst('tuple', rest.map(go))
    }
    const userDef = typeContext.get(firstWord)
    if (!userDef) throw new CompileError('unknown type: ' + firstWord)
    const { params } = userDef
    if (params.length !== rest.length) throw new CompileError('wrong number of type parameters')
    return typeInst(firstWord, ...rest.map((t) => go(t)))
  }
  return go
}

const makeSizer = (topContext, lctx) => {
  const { typeContext } = topContext
  const typeToSizeNumber = (typeVarEnv, type) => {
    switch (type.typeKind) {
      case 'var': {
        const newLocal = typeVarEnv.get(type.name)
        if (newLocal === undefined) throw new CompileError('unbound type variable: ' + type.name)
        return typeToSizeNumber(typeVarEnv, newLocal)
      }
      case 'inst': {
        const { typeName, args: targs } = type
        const builtinTypeSize = builtInPrimitiveTypeSizes[typeName]
        if (builtinTypeSize !== undefined) {
          if (targs.length !== 0) throw new CompileError('built-in type expected no arguments')
          return builtinTypeSize
        }
        switch (typeName) {
          case 'array': {
            if (targs.length !== 2) throw new CompileError('array expected two arguments')
            const [elementType, arraySizeForm] = targs
            const elementTypeSize = typeToSizeNumber(typeVarEnv, elementType)
            let arraySize
            if (arraySizeForm.typeKind === 'var') {
              arraySize = typeVarEnv.get(arraySizeForm.name)
            } else {
              arraySize = arraySizeForm
            }
            if (arraySize.typeKind !== 'exp') throw new CompileError('array size expected exp type')
            // this may fail if the expression depends on a variable
            const arraySizeExp = compExp(null, arraySize.exp, topContext)
            const f = new Function('return ' + jsExpToStringSafe(arraySizeExp))
            const arraySizeNum = f()
            return elementTypeSize * arraySizeNum
          }
          case 'pointer':
          case 'exp':
            return 4
          case 'any':
            throw new CompileError('size-of any not allowed')
        }
        const userDef = typeContext.get(typeName)
        if (!userDef) throw new CompileError('unknown type: ' + typeName)
        const { params, kind } = userDef
        const newSubst = new Map()
        for (let i = 0; i < params.length; i++) newSubst.set(params[i], targs[i])
        switch (kind) {
          case 'record':
            return userDef.fields.reduce((acc, field) => acc + typeToSizeNumber(newSubst, field.fieldType), 0)
          case 'untagged-union':
            return Math.max(0, ...userDef.types.map((t) => typeToSizeNumber(newSubst, t)))
          case 'union':
            throw new CompileError('union not allowed')
          default:
            throw new CompileError('unknown type kind: ' + kind)
        }
      }
      case 'func':
        throw new CompileError('size-of func not allowed')
    }
    throw new CompileError('unknown type kind: ' + type.typeKind)
  }
  const typeToSizeJSExp = (typeVarEnv, type) => {
    if (type.typeKind !== 'inst') return jsNumber(typeToSizeNumber(typeVarEnv, type))
    const { typeName, args: targs } = type
    if (typeName === 'array') {
      if (targs.length !== 2) throw new CompileError('array expected two arguments')
      const [elementType, arraySizeForm] = targs
      const elementTypeSize = typeToSizeJSExp(typeVarEnv, elementType)
      let arraySize
      if (arraySizeForm.typeKind === 'var') {
        arraySize = typeVarEnv.get(arraySizeForm.name)
      } else {
        arraySize = arraySizeForm
      }
      if (arraySize.typeKind !== 'exp') throw new CompileError('array size expected exp type')
      // this may fail if the expression depends on a variable
      const arraySizeExp = compExp(lctx, arraySize.exp, topContext)
      return jsBin('mul')(elementTypeSize, arraySizeExp)
    }
    const userDef = typeContext.get(typeName)
    if (!userDef) return jsNumber(typeToSizeNumber(typeVarEnv, type))
    const { params, kind } = userDef
    if (params.length !== targs.length) throw new CompileError('wrong number of type parameters')
    const newSubst = new Map()
    for (let i = 0; i < params.length; i++) newSubst.set(params[i], targs[i])
    switch (kind) {
      case 'record':
        return userDef.fields.reduce((acc, field) => jsAdd(acc, typeToSizeJSExp(newSubst, field.fieldType)), js0)
      case 'untagged-union':
        return userDef.types.reduce((acc, t) => jsCall(jsMathMax, [acc, typeToSizeJSExp(newSubst, t)]), js0)
      case 'union':
        return userDef.constructors.reduce(
          (acc, { params }) =>
            jsCall(jsMathMax, [acc, params.reduce((acc, p) => jsAdd(acc, typeToSizeJSExp(newSubst, p)), js0)]),
          js0,
        )
      default:
        throw new CompileError('unknown type kind: ' + kind)
    }
  }
  const offset = (typeVarEnv, type, fieldName) => {
    const optName = tryGetFormWord(type)
    if (optName !== null) {
      if (typeVarEnv && typeVarEnv.has(optName)) return offset(typeVarEnv, typeVarEnv.get(optName), fieldName)
      return offset(null, makeFormList([type]), fieldName)
    }
    const list = tryGetFormList(type)
    if (!list) {
      console.error('type', type)
      throw new CompileError('expected list')
    }
    if (list.length === 0) throw new CompileError('type list empty')
    const [first, ...targs] = list
    const firstName = getFormWord(first)
    const userDef = typeContext.get(firstName)
    if (!userDef) throw new CompileError('unknown type: ' + firstName)
    const { params, kind } = userDef
    if (params.length !== targs.length) throw new CompileError('wrong number of type parameters')
    const newSubst = new Map()
    for (let i = 0; i < params.length; i++) newSubst.set(params[i], targs[i])
    switch (kind) {
      case 'record': {
        let offset = 0
        for (const { name, fieldType } of userDef.fields) {
          if (name === fieldName) return { offset, fieldType }
          offset += typeToSizeNumber(newSubst, fieldType)
        }
        throw new CompileError('field not found: ' + fieldName)
      }
      default:
        throw new CompileError('unknown type kind: ' + kind)
    }
  }
  return {
    sizeOfExp: (type) => typeToSizeJSExp(null, type),
    offset: (type, field) => offset(null, type, field),
  }
}

const primtiveArrays = Object.freeze({
  i8: { arrayName: 'Int8Array', byteSize: 1 },
  u8: { arrayName: 'Uint8Array', byteSize: 1 },
  i16: { arrayName: 'Int16Array', byteSize: 2 },
  u16: { arrayName: 'Uint16Array', byteSize: 2 },
  i32: { arrayName: 'Int32Array', byteSize: 4 },
  i64: { arrayName: 'BigInt64Array', byteSize: 8 },
  u64: { arrayName: 'BigUint64Array', byteSize: 8 },
  f64: { arrayName: 'Float64Array', byteSize: 8 },
})

const loadStoreFormToSub = (tail, lctx, topContext) => {
  const [memForm, pointerForm, targetTypeForm, fieldNameForm] = tail
  const memName = getFormWord(memForm)
  const memDesc = topContext.defEnv.get(memName)
  if (!memDesc) throw new CompileError('undefined memory')
  if (memDesc.defKind !== 'memory') throw new CompileError('not a memory')
  const fieldName = getFormWord(fieldNameForm)
  const sizer = makeSizer(topContext, null)
  const { offset, fieldType } = sizer.offset(targetTypeForm, fieldName)
  const { typeKind } = fieldType
  if (typeKind !== 'inst') throw new CompileError('expected field type')
  const fieldTypeName = fieldType.typeName
  const typeName = fieldTypeName === 'pointer' ? 'i32' : fieldTypeName
  const primArray = primtiveArrays[typeName]
  if (!primArray) throw new CompileError('primitive array expected')
  const { arrayName, byteSize } = primArray
  const arrayExp = jsNew(jsCall(jsVar(arrayName), [jsSubscript(jsVar(memName), jsString('buffer')), jsNumber(offset)]))
  const pointer = compExp(lctx, pointerForm, topContext)
  const addrExp = byteSize === 1 ? pointer : jsOr0(jsBin('div')(pointer, jsNumber(byteSize)))
  return jsSubscript(arrayExp, addrExp)
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
  i64: () => {
    throw new CompileError('i64 not implemented')
  },
  f32: () => {
    throw new CompileError('f32 not implemented')
  },
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
  intrinsic: (tail, ctx, topContext) => {
    if (tail.length < 1) throw new CompileError('intrinsic expected at least one argument')
    const { defEnv } = topContext
    const [opForm, ...args] = tail
    const opName = getFormWord(opForm)
    const loadMem = (primtypeName) => {
      const { arrayName, byteSize } = primtiveArrays[primtypeName]
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
      let addrExp = jsAdd(jsNumber(offset), compExp(ctx, addrForm, topContext))
      // need to divide by byteSize
      if (byteSize !== 1) addrExp = jsOr0(jsBin('div')(addrExp, jsNumber(byteSize)))
      return jsSubscript(arrayExp, addrExp)
    }
    const loadInstToType = {
      'i32.load': 'i32',
      'i32.load8-u': 'u8',
      'i32.load8-s': 'i8',
      'i32.load16-u': 'u16',
      'i32.load16-s': 'i16',
      'f64.load': 'f64',
    }
    const loadType = loadInstToType[opName]
    if (loadType) {
      if (args.length !== 4) throw new CompileError(opName + ' expected four arguments')
      return loadMem(loadType)
    }
    const storeInstToType = {
      'i32.store8': 'i8',
      'i32.store16': 'i16',
      'i32.store': 'i32',
      'f64.store': 'f64',
    }
    const storeType = storeInstToType[opName]
    if (storeType) {
      if (args.length !== 5) throw new CompileError(opName + ' expected five arguments')
      const jsExp = jsAssignExp(loadMem(storeType), compExp(ctx, args[4], topContext))
      return jsParenComma([jsExp, jsUndefined])
    }

    const intrinsic = intrinsics[opName]
    if (!intrinsic) throw new CompileError('undefined intrinsic: ' + opName)
    if (args.length !== intrinsic.length) throw new CompileError('wrong number of arguments')
    return opIntrinsicCall(
      opName,
      args.map((arg) => compExp(ctx, arg, topContext)),
    )
  },
  func: compFunc,
  if: (tail, ctx, defEnv) => {
    if (tail.length !== 3) throw new CompileError('if expected three arguments')
    return jsTernary(...tail.map((f) => compExp(ctx, f, defEnv)))
  },
  'type-anno': (tail, ctx, defEnv) => compExp(ctx, tail[0], defEnv),
  'size-of': (tail, lctx, topContext) => {
    if (tail.length !== 1) throw new CompileError('size-of expected one argument')
    const sizer = makeSizer(topContext, lctx)
    const typeForm = tail[0]
    const type = makeTypeValidator(topContext.typeContext, [])(typeForm)
    return sizer.sizeOfExp(type)
  },
  'load-field': (tail, lctx, topContext) => {
    if (tail.length !== 4) throw new CompileError('load-field expected four arguments')
    return loadStoreFormToSub(tail, lctx, topContext)
  },
  'store-field': (tail, lctx, topContext) => {
    if (tail.length !== 5) throw new CompileError('store-field expected five arguments')
    const jsSub = loadStoreFormToSub(tail, lctx, topContext)
    const jsExp = jsAssignExp(jsSub, compExp(lctx, tail[4], topContext))
    return jsParenComma([jsExp, jsUndefined])
  },
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
Object.freeze(expSpecialFormsStmt)

const isSpecialForm = (word) => word in expSpecialFormsExp || word in expSpecialFormsStmt

const compExpStmt = (lctx, form, topContext, isTail) => {
  const forms = tryGetFormList(form)
  if (forms) {
    if (forms.length === 0) throw new CompileError('empty list')
    const [firstForm, ...args] = forms
    const firstWord = tryGetFormWord(firstForm)
    if (firstWord) {
      const stmtSpecialHandler = expSpecialFormsStmt[firstWord]
      if (stmtSpecialHandler) {
        const stmt = stmtSpecialHandler(args, lctx, topContext, isTail)
        return isTail ? stmt : jsExpStmt(jsIIFE([stmt]))
      }
      const expSpecialHandler = expSpecialFormsExp[firstWord]
      if (expSpecialHandler) {
        const exp = expSpecialHandler(args, lctx, topContext)
        return isTail ? jsReturn(exp) : jsExpStmt(exp)
      }
      const desc = topContext.defEnv.get(firstWord)
      if (desc && desc.defKind === 'defmacro') return compExpStmt(lctx, desc.value(...args), topContext, isTail)
    }
  }
  const jsExp = compExp(lctx, form, topContext)
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
    if (firstWord === 'do') return jsIIFE(bodiesToStmts(topContext, ctx, args, true))
    if (firstWord in topSpecialForms) throw new CompileError('top special not allowed in expression form')

    const expSpecialHandler = expSpecialFormsExp[firstWord]
    if (expSpecialHandler) return expSpecialHandler(args, ctx, topContext)

    const stmtSpecialHandler = expSpecialFormsStmt[firstWord]
    if (stmtSpecialHandler) return jsIIFE([stmtSpecialHandler(args, ctx, topContext, true)])

    const defDesc = topContext.defEnv.get(firstWord)
    if (defDesc) {
      const { defKind, value, paramDesc } = defDesc
      if (paramDesc) {
        const { parameters, restParam } = paramDesc
        const numOfArgs = args.length
        if (numOfArgs < parameters.length) throw new CompileError('not enough arguments', form)
        if (!restParam && numOfArgs > parameters.length) throw new CompileError('too many arguments', form)
      }
      switch (defKind) {
        case 'defmacro':
          return compExp(ctx, value(...args), topContext)
        case 'defexpr':
          return jsCall(jsVar(firstWord), args.map(formToQuotedJS))
        default:
          break
      }
    }
  }
  return jsCall(
    compExp(ctx, firstForm, topContext),
    args.map((arg) => compExp(ctx, arg, topContext)),
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
      const typeParams = descObj.params
      const typeValidator = makeTypeValidator(typeContext, typeParams)
      const validateType = (typeForm) => typeValidator(typeForm)

      const body = getFormList(forms[i + 2])
      const typeKind = getFormWord(body[0])
      descObj.kind = typeKind
      const typePrefix = `${typeName}/`
      switch (typeKind) {
        case 'union': {
          const constructors = []
          for (let i = 1; i < body.length; i++) {
            const unionCase = getFormList(body[i])
            if (unionCase.length === 0) throw new CompileError('union case must have at least one word')
            const unionCaseName = getFormWord(unionCase[0])
            const qualName = typePrefix + unionCaseName
            const paramtypes = unionCase.slice(1)
            const parameters = paramtypes.map((pt, i) => {
              validateType(pt)
              return `p${i}`
            })
            const ctor = jsArrowExpNoRest(parameters, mkTaggedObject(qualName, ...parameters.map((p) => jsVar(p))))
            const defDesc = await setDef(topContext, qualName, 'unionCtor', ctor)
            defDesc.paramDesc = { parameters }
            constructors.push({ name: unionCaseName, params: paramtypes })
          }
          descObj.constructors = constructors
          break
        }
        case 'untagged-union': {
          const types = []
          for (let i = 1; i < body.length; i++) {
            const t = body[i]
            types.push(validateType(t))
          }
          descObj.types = types
          break
        }
        case 'record': {
          const fieldNames = []
          const fields = []
          for (let i = 1; i < body.length; i++) {
            const recordField = getFormList(body[i])
            if (recordField.length != 2) throw new CompileError('record field must have a name and a type')
            const fieldName = getFormWord(recordField[0])
            fieldNames.push(fieldName)
            const projecterName = typePrefix + fieldName
            const jsProjecter = jsArrowExpNoRest(['record'], jsSubscript(jsVar('record'), jsString(fieldName)))
            await setDef(topContext, projecterName, 'recordProj', jsProjecter)
            const typeForm = recordField[1]
            const fieldType = validateType(typeForm)
            fields.push({ name: fieldName, typeForm, fieldType })
          }
          const jsConstructor = jsArrowExpNoRest(fieldNames, mkObject(...fieldNames.map((f) => [f, jsVar(f)])))
          await setDef(topContext, typeName, 'recordCtor', jsConstructor)
          descObj.fields = fields
          break
        }
        default:
          throw new CompileError('unexpected type body: ' + typeKind)
      }
    }
  },
  export: (_, forms, { defEnv }) => {
    for (const form of forms) {
      const exportWord = getFormWord(form)
      if (!defEnv.has(exportWord)) throw new CompileError('exported def variable not found: ' + exportWord, form)
    }
  },
  import: async (_, tail, topContext) => {
    if (tail.length !== 3) throw new CompileError('import expects three arguments')
    const importModuleName = getFormWord(tail[0])
    const importElementName = getFormWord(tail[1])
    const importType = getFormList(tail[2])
    const jsExp = jsAwait(jsCall(jsVar('dynImport'), [jsString(importModuleName), jsString(importElementName)]))
    await setDef(topContext, importElementName, 'import', jsExp)
  },
  memory: async (_, tail, topContext) => {
    const [memoryName, memorySize] = tail.map(getFormWord)
    const initialSize = +memorySize
    if (initialSize <= 0) throw new CompileError('memory size must be positive')
    if ((initialSize !== initialSize) | 0) throw new CompileError('memory size must be an integer')
    const jsMemDesc = mkObject(['initial', jsNumber(initialSize)])
    const jsExp = jsNew(jsCall(jsSubscript(jsVar('WebAssembly'), jsString('Memory')), [jsMemDesc]))
    await setDef(topContext, memoryName, 'memory', jsExp)
  },
}

const compileTopDefEnv = async (topContext, form) => {
  const { defEnv } = topContext
  const forms = tryGetFormList(form)
  if (forms && forms.length > 0) {
    const [firstForm, ...args] = forms
    const firstWord = tryGetFormWord(firstForm)
    if (firstWord) {
      const topSpecialHandler = topSpecialForms[firstWord]
      if (topSpecialHandler) {
        await topSpecialHandler(firstWord, args, topContext)
        return null
      }
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
    const optJsExp = await compileTopDefEnv(topContext, form)
    if (optJsExp === null) return
    if (optJsExp) return await evalExpAsync(topContext, optJsExp)
  }
  const evalTops = async (forms) => {
    let result = null
    for (const form of forms) result = await evalTop(form)
    if (result !== null) return result
  }
  const evalTopsExp = async (forms) => {
    if (forms.length === 0) throw new CompileError('empty list')
    for (let i = 0; i < forms.length - 1; i++) await compileTopDefEnv(topContext, forms[i])
    const lastForm = forms.at(-1)
    const jsExp = compExp(null, lastForm, topContext)
    return await evalExpAsync(topContext, jsExp)
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
