const instOpConstant = 1
const instOpSwitch = 2
const instOpInsts = 3
const instOpLocalGet = 4
const instOpLocalSet = 5
const instOpLoop = 6
const instOpContinue = 7
const instOpIntrinsic = 8
const instOpDrop = 9

class EvalError extends Error {
  constructor(message, inst) {
    super(message)
    this.inst = inst
  }
}

const evalInst = () => {
  const stack = []
  let currentLoopBody = null
  const go = (inst) => {
    const evalError = (message) => new EvalError(message, inst)
    const pop = () => {
      if (stack.length === 0) throw evalError('stack underflow')
      return stack.pop()
    }
    const push = (value) => stack.push(value)
    while (true) {
      if (!inst) throw evalError('no instruction')
      switch (inst.tag) {
        case instOpConstant:
          push(inst.value)
          return
        case instOpLocalGet: {
          const { index } = inst
          if (index >= stack.length) throw evalError('stack underflow')
          push(stack.at(-index))
          return
        }
        case instOpLocalSet:
          const { index } = inst
          if (index >= stack.length) throw evalError('stack underflow')
          stack[stack.length - index] = inst.value
          return
        case instOpDrop:
          pop()
          return
        case instOpIntrinsic: {
          const b = pop()
          const a = pop()
          push(inst.f(a, b))
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
            // here we assume nothing is pushed to the stack... or do we need to know that?
            go(subInst)
          }
          inst = inst.last
          continue
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

import {
  tryGetFormWord,
  tryGetFormList,
  isTaggedValue,
  makeValueTagger,
  atom,
  makeRecord,
  getRecordType,
  formWord,
  formList,
  emptyList,
} from './core.js'

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
const mkDoInst = (insts, last) => Object.freeze({ tag: instOpInsts, insts, last })
const mkIntrinsicInst = (f) => Object.freeze({ tag: instOpIntrinsic, f })
const mkSwitchInst = (cases, defaultCase) => Object.freeze({ tag: instOpSwitch, cases, defaultCase })

import { instructionFunctions } from './instructions.js'
import { wrapJSFunctionsToObject } from './utils.js'

const instructions = wrapJSFunctionsToObject(instructionFunctions)
const isSpecialFormPrimitiveConstant = (word) => word === 'i32' || word === 'f64' || word === 'word'

const compile = (form) => {
  const go = (ctx, form) => {
    const compileError = (message, innerError) => new CompileError(message, form, innerError)
    const word = tryGetFormWord(form)
    if (word) {
      let curCtx = ctx
      while (curCtx) {
        if (curCtx.has(word)) return mkLocalGetInst(curCtx.get(word))
        curCtx = curCtx.outer
      }
      throw compileError('undefined variable: ' + word)
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
    const tryFormToConstant = (form) => {
      const forms = getFormList(form)
      if (forms.length === 0) throw compileError('empty list')
      const [firstForm] = forms
      const firstWord = tryGetFormWord(firstForm)
      if (!firstWord) return null
      if (forms.length !== 2) throw compileError(`special form '${firstWord}' expected 2 arguments, got ${forms.length - 1}`)
      switch (firstWord) {
        // constants
        case 'i32':
          return +getFormWord(forms[1]) | 0
        case 'f64': {
          const v = +getFormWord(forms[1])
          if (isNaN(v)) throw compileError('expected number')
          return v
        }
        case 'word':
          return getFormWord(forms[1])
      }
      return null
    }
    const constantValue = tryFormToConstant(form)
    if (constantValue !== null) return mkConstantInst(constantValue)
    switch (firstWord) {
      case 'switch': {
        if (numOfArgs < 2) throw compileError(`special form 'switch' expected at least two arguments`)
        if (numOfArgs % 2 !== 0) throw compileError('no switch default found')
        const value = go(ctx, forms[1])
        const cases = []
        for (let i = 2; i < forms.length - 1; i += 2) {
          const pattern = forms[i]
          const patternList = getFormList(pattern)
          const firstPatternWord = getFormWord(patternList[0])
          if (!isSpecialFormPrimitiveConstant(firstPatternWord))
            throw compileError('switch pattern must be constant, was ' + firstPatternWord)
          const caseValue = tryFormToConstant(pattern)
          if (caseValue === null) throw compileError('switch pattern must be constant')
          cases.push(Object.freeze({caseValue, caseInst: go(ctx, forms[i + 1])}))
        }
        const defaultCase = go(ctx, forms.at(-1))
        return mkDoInst([value], mkSwitchInst(cases, defaultCase))
      }
    }
    if (!firstWord) {
      const firstList = getFormList(firstForm)
      const firstFirstWord = getFormWord(firstList[0])
      switch (firstFirstWord) {
        case 'intrinsic': {
          assertNumArgs(2)
          const _ins = getFormWord(firstList[1])
          if (_ins !== 'instructions') throw compileError('expected instructions')
          const instructionName = getFormWord(firstList[2])
          if (instructionName === 'unreachable') throw compileError('unreachable not implemented')
          const instFunc = instructions[instructionName]
          if (!instFunc) throw compileError('unknown instruction')
          return mkDoInst(
            forms.slice(1).map((f) => go(ctx, f)),
            mkIntrinsicInst(instFunc),
          )
        }
      }
    }
    throw compileError('unknown form')
  }
  return go(null, form)
}

export { compile, evalInst }
