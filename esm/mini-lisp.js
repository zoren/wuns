const makeEnv = (outer) => {
  const env = new Map()
  if (outer) {
    env.outer = outer
    const { invocation } = outer
    if (invocation) env.invocation = invocation
  }
  return env
}
const hasLocal = (env, varName) => {
  let curEnv = env
  while (curEnv) {
    if (curEnv.has(varName)) return true
    curEnv = curEnv.outer
  }
  return false
}
const setEnv = (env, varName, value) => {
  env.set(varName, value)
}

class Closure {
  constructor(env, name, parameters, body) {
    this.env = env
    this.name = name
    this.parameters = parameters
    this.body = body
  }
}

const makeClosure = (env, name, parameters, body) => Object.freeze(new Closure(env, name, parameters, body))
const symbolMeta = Symbol.for('wuns-meta')

const cloneClosureWithMeta = ({ env, name, parameters, body }, meta) => {
  const clone = new Closure(env, name, parameters, body)
  clone[symbolMeta] = meta
  return Object.freeze(clone)
}
const print = (value) => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return `[i32 ${value}]`
  if (Array.isArray(value)) return `[${value.map(print).join(' ')}]`
  if (typeof value === 'function') return '[func]'
  if (value instanceof Closure) return `[closure ${value.name} ${value.parameters.join(' ')}]`
}

const list = (...args) => Object.freeze(args)

const setParameters = (parameters, paramEnv, eargs) => {
  if (parameters.length > 1 && parameters.at(-2) === '..') {
    const restParam = parameters.at(-1)
    parameters = parameters.slice(0, -2)
    setEnv(paramEnv, restParam, list(...eargs.slice(parameters.length)))
  }
  parameters.forEach((param, i) => setEnv(paramEnv, param, eargs[i]))
}

const makeParamEnv = (defFunc, args) => {
  const paramEnv = makeEnv(defFunc.env)
  setParameters(defFunc.parameters, paramEnv, args)
  paramEnv.invocation = { closure: defFunc, paramEnv }
  return paramEnv
}

const getMeta = (form) => form[symbolMeta]

const makeEvaluator = (defEnv) => {
  const go = (env, form) => {
    while (true) {
      if (typeof form === 'string') {
        let curEnv = env
        while (curEnv) {
          if (curEnv.has(form)) return curEnv.get(form)
          curEnv = curEnv.outer
        }
        if (!defEnv.has(form)) throw new Error('undefined variable: ' + form)
        return defEnv.get(form)
      }
      if (!Array.isArray(form) || form.length === 0) throw new Error('unexpected form: ' + print(form))
      const [first] = form
      switch (first) {
        case 'i32':
          return +form[1] | 0
        case 'word':
          return form[1]
        case 'func':
          return makeClosure(env, ...form.slice(1))

        case 'if':
          form = form[go(env, form[1]) ? 2 : 3]
          continue
        case 'do':
          if (form.length === 1) return
          for (let i = 1; i < form.length - 1; i++) go(env, form[i])
          form = form.at(-1)
          continue
        case 'let': {
          const bindings = form[1]
          const newEnv = makeEnv(env)
          for (let i = 0; i < bindings.length - 1; i += 2) setEnv(newEnv, bindings[i], go(newEnv, bindings[i + 1]))
          env = newEnv
          form = form[2]
          continue
        }
        case 'recur': {
          const eargs = form.slice(1).map((arg) => go(env, arg))
          const { closure, paramEnv } = env.invocation
          const { parameters, body } = closure
          setParameters(parameters, paramEnv, eargs)
          form = body
          continue
        }
        case 'def': {
          const [, name, value] = form
          defEnv.set(name, go(env, value))
          return
        }
      }
      const args = form.slice(1)
      if (typeof first === 'string' && !hasLocal(env, first)) {
        const defFunc = defEnv.get(first)
        if (defFunc instanceof Closure) {
          const funcKind = getMeta(defFunc)
          if (funcKind === 'fexpr') return go(makeParamEnv(defFunc, args), defFunc.body)
          if (funcKind === 'macro') {
            form = go(makeParamEnv(defFunc, args), defFunc.body)
            continue
          }
        }
      }
      {
        const func = go(env, first)
        const eargs = args.map((arg) => go(env, arg))
        if (typeof func === 'function') return func(...eargs)
        if (!(func instanceof Closure)) throw new Error('not a function: ' + print(first))
        env = makeParamEnv(func, eargs)
        form = func.body
        continue
      }
    }
  }
  return (form) => go(makeEnv(), form)
}

import { parse } from './parseTreeSitter.js'

function* parseToForms(content, metaPrefix) {
  const makeMeta = metaPrefix ? (...args) => list(metaPrefix, ...args) : list
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const nodeToForm = (node) => {
    const { isError, type } = node
    if (isError) throw new Error('unexpected error node')
    switch (type) {
      case 'word':
        return node.text
      case 'list': {
        const l = node.namedChildren.map(nodeToForm)
        const { row, column } = node.startPosition
        l[symbolMeta] = makeMeta(row + 1, column + 1)
        return Object.freeze(l)
      }
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  for (const child of parse(content).rootNode.namedChildren) yield nodeToForm(child)
}

const size = (list) => list.length

const with_meta = (object, meta) => {
  if (object instanceof Closure) return cloneClosureWithMeta(object, meta)
  if (Array.isArray(object)) {
    const copy = object.slice()
    copy[symbolMeta] = meta
    return Object.freeze(copy)
  }
  throw new Error('with-meta expects closure or list')
}

const std = {
  list,
  size,
  at: (list, i) => list.at(i),

  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  lt: (a, b) => a < b,
  log: console.log,
  'performance-now': () => performance.now(),
  'with-meta': with_meta,
  meta: getMeta,
}

const defEnv = new Map()
for (const [name, value] of Object.entries(std)) defEnv.set(name, value)

import fs from 'node:fs'

const commandLineArgs = process.argv.slice(2)
const endsWithDashFlag = commandLineArgs.at(-1) === '-'
const files = endsWithDashFlag ? commandLineArgs.slice(0, -1) : commandLineArgs
const evaluate = makeEvaluator(defEnv)
for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'ascii')
  const forms = parseToForms(content, filePath)
  for (const form of forms) evaluate(form)
}
import { startRepl } from './repl-util.js'

if (!endsWithDashFlag) {
  startRepl('mini-lisp-history.json', 'mini-lisp> ', (line) => {
    try {
      let result
      for (const form of parseToForms(line)) result = evaluate(form)
      console.log(print(result))
    } catch (err) {
      console.error(err)
    }
  })
}
