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

const print = (value) => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return `[int ${value}]`
  if (typeof value === 'function') return '[func]'
  if (Array.isArray(value)) return `[list ${value.map(print).join(' ')}]`
}

const directEval = (env, form) => {
  while (true) {
    if (typeof form === 'string') return lookupEnv(env, form)
    if (!Array.isArray(form) || form.length === 0) {throw new Error('unexpected form: ' + print(form))}
    const [first] = form
    switch (first) {
      case 'int':
        return +form[1] | 0
      case 'func':
        return { type: 'closure', env, params: form[1], body: form[2] }

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
    if (func.type !== 'closure') throw new Error('not a function: ' + print(func))
    const { params, body, env: funcEnv } = func
    const newEnv = makeEnv(funcEnv)
    params.forEach((param, i) => {
      setEnv(newEnv, param, directEval(env, form[i + 1]))
    })
    env = newEnv
    form = body
    continue
  }
}

import { parse } from './parseTreeSitter.js'

function* parseToForms(content) {
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
        return Object.freeze(l)
      }
      default:
        throw new Error('unexpected node type: ' + type)
    }
  }
  for (const child of parse(content).rootNode.namedChildren) yield nodeToForm(child)
}

import { startRepl } from './repl-util.js'

const env = makeEnv()
const std = {
  list: (...args) => Object.freeze(args),
  size: (list) => list.length,

}
for (const [name, value] of Object.entries(std)) setEnv(env, name, value)

startRepl('mini-lisp-history.json', 'mini-lisp> ', (line) => {
  try {
    let result
    for (const form of parseToForms(line)) result = directEval(env, form)
    console.log(print(result))
  } catch (err) {
    console.error(err)
  }
})
