const instOpConstant = 1
const instOpSwitch = 2
const instOpInsts = 3
const instOpLocalGet = 4
const instOpLocalSet = 5
const instOpLoop = 6
const instOpContinue = 7
const instOpIntrinsic = 8
const instOpDrop = 9
const instOpFunction = 10
const instOpCall = 11
const instOpCallRecursive = 12
const instOpPushRecursionContext = 13
const instOpPopRecursionContext = 14

class EvalError extends Error {
  constructor(message, inst) {
    super(message)
    this.inst = inst
  }
}

const evalInst = () => {
  const stack = []
  const locals = []
  let currentLoopBody = null
  const go = (inst) => {
    const evalError = (message) => new EvalError(message, inst)
    const pop = () => {
      if (stack.length === 0) throw evalError('stack underflow')
      return stack.pop()
    }
    const assertValidValue = (value) => {
      if (typeof value !== 'number' && typeof value !== 'string') {
        throw evalError('expected number or string')
      }
    }
    const push = (value) => {
      assertValidValue(value)
      stack.push(value)
    }
    const setLocal = (index, value) => {
      assertValidValue(value)
      locals[index] = value
    }
    while (true) {
      if (!inst) throw evalError('no instruction')
      switch (inst.tag) {
        case instOpConstant:
          push(inst.value)
          return
        case instOpLocalGet: {
          const { index } = inst
          const value = locals[index]
          if (value === undefined) throw evalError('undefined local')
          push(value)
          return
        }
        case instOpLocalSet:
          const { index } = inst
          setLocal(index, pop())
          return
        case instOpDrop:
          pop()
          return
        case instOpIntrinsic: {
          // we assume intrinsics is binary taking numbers and returning a number
          const b = pop()
          const a = pop()
          if (typeof a !== 'number') throw evalError('intrinsic first argument is not a number')
          if (typeof b !== 'number') throw evalError('intrinsic second argument is not a number')
          const res = inst.f(a, b)
          if (typeof res !== 'number') throw evalError('intrinsic did not return a number')
          push(res)
          return
        }

        case instOpSwitch: {
          const value = pop()
          if (typeof value !== 'number') throw evalError('switch value is not a number')
          let chosenInst = inst.defaultCase
          for (const { caseValue, caseInst } of inst.cases) {
            if (value === caseValue) {
              chosenInst = caseInst
              break
            }
          }
          inst = chosenInst
          continue
        }
        case instOpLoop:
          currentLoopBody = inst.body
          inst = inst.body
          continue
        case instOpContinue:
          inst = currentLoopBody
          continue
        case instOpInsts:
          for (const subInst of inst.insts) {
            go(subInst)
          }
          inst = inst.last
          continue
        case instOpFunction:
          // just a placeholder, we don't allow functions as values
          push(0)
          return
        case instOpCall: {
          const { func, args } = inst
          args.forEach((arg, i) => {
            go(arg)
            setLocal(i, pop())
          })
          inst = func.body
          continue
        }

        default:
          throw new Error('unexpected inst tag: ' + inst.tag)
      }
    }
  }
  return (form) => {
    go(form)
    return stack
  }
}

class CompileError extends Error {
  constructor(message, form, innerError) {
    super(message)
    this.form = form
    this.innerError = innerError
  }
}

import { tryGetFormWord, tryGetFormList } from './core.js'

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

const mkConstantInst = (value) => Object.freeze({ tag: instOpConstant, value })
const mkLocalGetInst = (index) => Object.freeze({ tag: instOpLocalGet, index })
const mkDoInst = (...insts) => {
  if (insts.length === 0) throw new Error('empty do')
  for (const inst of insts) {
    if (typeof inst.tag !== 'number') throw new Error('expected inst')
  }
  return Object.freeze({ tag: instOpInsts, insts: insts.slice(0, -1), last: insts.at(-1) })
}
const mkIntrinsicInst = (f) => Object.freeze({ tag: instOpIntrinsic, f })
const mkSwitchInst = (cases, defaultCase) => Object.freeze({ tag: instOpSwitch, cases, defaultCase })
const mkFunctionInst = (name, parameters, restParam, body) =>
  Object.freeze({ tag: instOpFunction, name, parameters, restParam, body })
const mkCallInst = (func, args) => Object.freeze({ tag: instOpCall, func, args })
const mkCallRecursiveInst = (name, args) => Object.freeze({ tag: instOpCallRecursive, name, args })
const mkPushRecursionContextInst = (name, body) => Object.freeze({ tag: instOpPushRecursionContext, name, body })
const dropInst = Object.freeze({ tag: instOpDrop })

import { instructionFunctions } from './instructions.js'
import { wrapJSFunctionsToObject } from './utils.js'

const instructions = wrapJSFunctionsToObject(instructionFunctions)

const tryFormToConstant = (form) => {
  const forms = getFormList(form)
  if (forms.length === 0) throw new CompileError('empty list', form)
  const firstWord = tryGetFormWord(forms[0])
  if (!firstWord) return null
  const parseNumber = (w) => {
    const v = +w
    if (isNaN(v)) throw new CompileError('expected number', form)
    return v
  }
  const specials = {
    i32: (w) => {
      const v = parseNumber(w)
      const normed = v | 0
      if (v !== normed) throw new CompileError('expected i32', form)
      return normed
    },
    f64: parseNumber,
    word: (w) => w,
  }
  const special = specials[firstWord]
  if (!special) return null
  if (forms.length !== 2)
    throw new CompileError(`special form '${firstWord}' expected 2 arguments, got ${forms.length - 1}`, form)
  return special(getFormWord(forms[1]))
}

const makeCtx = (outer) => {
  const vars = new Map()
  vars.outer = outer
  return vars
}

const setNewCtxVar = (ctx, varName, varDesc) => {
  if (ctx.has(varName)) throw new CompileError('variable already defined', varName)
  ctx.set(varName, varDesc)
}

const getCtxVar = (ctx, varName) => {
  let curCtx = ctx
  while (curCtx) {
    if (curCtx.has(varName)) return curCtx.get(varName)
    curCtx = curCtx.outer
  }
  throw new CompileError('undefined variable: ' + varName)
}

const go = (ctx, form) => {
  const compileError = (message, innerError) => new CompileError(message, form, innerError)
  const word = tryGetFormWord(form)
  if (word) {
    const varDesc = getCtxVar(ctx, word)
    if (varDesc.tag === 'param') return mkLocalGetInst(varDesc.index)
    if (varDesc.tag === 'def') return varDesc.value
    throw compileError('expected variable')
  }
  const forms = getFormList(form)
  if (forms.length === 0) throw compileError('empty list')
  const [firstForm, ...args] = forms
  const firstWord = tryGetFormWord(firstForm)
  const numOfArgs = args.length
  const assertNumArgs = (num) => {
    if (numOfArgs !== num) throw compileError(`special form '${firstWord}' expected ${num} arguments, got ${numOfArgs}`)
  }
  const constantValue = tryFormToConstant(form)
  if (constantValue !== null) return mkConstantInst(constantValue)
  switch (firstWord) {
    case 'if': {
      // todo move to a preprocessor generating a switch form
      assertNumArgs(3)
      const condition = go(ctx, forms[1])
      const thenInst = go(ctx, forms[2])
      const elseInst = go(ctx, forms[3])
      return mkDoInst(condition, mkSwitchInst([{ caseValue: 0, caseInst: elseInst }], thenInst))
    }
    case 'switch': {
      if (numOfArgs < 2) throw compileError(`special form 'switch' expected at least two arguments`)
      if (numOfArgs % 2 !== 0) throw compileError('no switch default found')
      const value = go(ctx, forms[1])
      const cases = []
      for (let i = 2; i < forms.length - 1; i += 2) {
        const pattern = forms[i]
        const caseValue = tryFormToConstant(pattern)
        if (caseValue === null) throw compileError('switch pattern must be constant')
        cases.push(Object.freeze({ caseValue, caseInst: go(ctx, forms[i + 1]) }))
      }
      const defaultCase = go(ctx, forms.at(-1))
      return mkDoInst(value, mkSwitchInst(cases, defaultCase))
    }
    case 'do': {
      if (numOfArgs === 0) throw compileError('empty do')
      return mkDoInst(...args.slice(0, -1).map((f) => mkDoInst(go(ctx, f), dropInst)), go(ctx, args.at(-1)))
    }
    case 'def': {
      assertNumArgs(2)
      const name = getFormWord(forms[1])
      if (ctx.outer) throw compileError('def not allowed in inner scope')
      if (ctx.has(name)) throw compileError('variable already defined')
      const value = go(ctx, forms[2])
      setNewCtxVar(ctx, name, { tag: 'def', value })
      return value
    }
    case 'func': {
      assertNumArgs(3)
      const name = getFormWord(forms[1])
      let parameters = getFormList(forms[2]).map(getFormWord)
      const newCtx = makeCtx(ctx)
      setNewCtxVar(newCtx, name, { tag: 'func-internal' })
      let restParam = null
      if (parameters.length > 1 && parameters.at(-2) === '..') {
        restParam = parameters.at(-1)
        parameters = parameters.slice(0, -2)
        setNewCtxVar(ctx, restParam, { tag: 'param', isRest: true })
      }
      parameters.forEach((param, i) => setNewCtxVar(newCtx, param, { tag: 'param', index: i }))
      const body = go(newCtx, forms[3])
      return mkFunctionInst(
        name,
        parameters,
        restParam,
        body,
      )
    }
  }
  if (firstWord) {
    const varDesc = getCtxVar(ctx, firstWord)
    if (varDesc.tag === 'def')
      return mkCallInst(
        varDesc.value,
        args.map((arg) => go(ctx, arg)),
      )
    if (varDesc.tag != 'func-internal') throw compileError('expected recursive call')
    return mkCallRecursiveInst(firstWord, args.map((arg) => go(ctx, arg)))
  } else {
    const firstList = getFormList(firstForm)
    const firstFirstWord = getFormWord(firstList[0])
    switch (firstFirstWord) {
      case 'intrinsic': {
        const instructionName = getFormWord(firstList[1])
        if (instructionName === 'unreachable') throw compileError('unreachable not implemented')
        const instFunc = instructions[instructionName]
        if (!instFunc) throw compileError('unknown instruction')
        return mkDoInst(...args.map((f) => go(ctx, f)), mkIntrinsicInst(instFunc))
      }
    }
    return mkCallInst(
      go(ctx, firstForm),
      args.map((arg) => go(ctx, arg)),
    )
  }
}

const compile = (form) => go(new Map(), form)

export { compile, evalInst }
