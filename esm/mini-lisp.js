const makeEnv = (outer) => {
  const env = new Map()
  env.outer = outer
  return env
}
const lookupEnv = (env, varName) => {
  while (env) {
    if (env.has(varName)) return env.get(varName)
    env = env.outer
  }
  throw new Error('undefined variable: ' + varName)
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

const print = (value) => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return `[i32 ${value}]`
  if (Array.isArray(value)) return `[list ${value.map(print).join(' ')}]`
  if (typeof value === 'function') return '[func]'
  if (value instanceof Closure) return `[closure ${value.name} ${value.parameters.join(' ')}]`
}

const list = (...args) => Object.freeze(args)

const directEval = (env, form) => {
  while (true) {
    if (typeof form === 'string') return lookupEnv(env, form)
    if (!Array.isArray(form) || form.length === 0) {
      throw new Error('unexpected form: ' + print(form))
    }
    const [first] = form
    switch (first) {
      case 'i32':
        return +form[1] | 0
      case 'func':
        return makeClosure(env, ...form.slice(1))

      case 'if':
        form = form[directEval(env, form[1]) ? 2 : 3]
        continue
      case 'do':
        for (let i = 1; i < form.length - 1; i++) directEval(env, form[i])
        form = form.at(-1)
        continue
      case 'let': {
        const bindings = form[1]
        const newEnv = makeEnv(env)
        for (let i = 0; i < bindings.length - 1; i += 2)
          setEnv(newEnv, bindings[i], directEval(newEnv, bindings[i + 1]))
        env = newEnv
        form = form[2]
        continue
      }
    }
    const func = directEval(env, first)
    if (typeof func === 'function') return func(...form.slice(1).map((arg) => directEval(env, arg)))
    if (!(func instanceof Closure)) throw new Error('not a function: ' + print(first))
    const newEnv = makeEnv(func.env)
    func.parameters.forEach((param, i) => {
      setEnv(newEnv, param, directEval(env, form[i + 1]))
    })
    env = newEnv
    form = func.body
    continue
  }
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
        l.meta = makeMeta(row + 1, column + 1)
        return Object.freeze(l)
      }
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  for (const child of parse(content).rootNode.namedChildren) yield nodeToForm(child)
}

import { startRepl } from './repl-util.js'

const size = (list) => list.length
const std = {
  list,
  size,
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  lt: (a, b) => a < b,
  log: console.log,
}

const env = makeEnv()
for (const [name, value] of Object.entries(std)) setEnv(env, name, value)

import fs from 'node:fs'

for (const filePath of process.argv.slice(2)) {
  const content = fs.readFileSync(filePath, 'ascii')
  const forms = parseToForms(content, filePath)
  for (const form of forms) directEval(env, form)
}

startRepl('mini-lisp-history.json', 'mini-lisp> ', (line) => {
  try {
    let result
    for (const form of parseToForms(line)) result = directEval(env, form)
    console.log(print(result))
  } catch (err) {
    console.error(err)
  }
})
