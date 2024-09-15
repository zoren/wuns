// a most basic lisp
// - variables
// - functions
// - calls / potentially tail calls

// - literal
// - if
// - do
// - let
// - recur / potentially tail recur

// envs are maps from variable names to values
// forms are arrays of forms or strings, numbers, booleans or null
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
}
const setEnv = (env, varName, value) => {
  env.set(varName, value)
}

const directEval = (env, form) => {
  while (true) {
    if (typeof form === 'string') return lookupEnv(env, form)
    if (!Array.isArray(form) || form.length === 0) throw new Error('unexpected form: ' + form)
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
    if (func.type !== 'closure') {
      const eargs = Array.from({ length: form.length - 1 }, (_, i) => directEval(env, form[i + 1]))
      return func(...eargs)
    }
    const { params, body, env: funcEnv } = func
    const newEnv = makeEnv(funcEnv)
    for (let i = 0; i < params.length; i++) setEnv(newEnv, params[i], directEval(env, form[i + 1]))
    env = newEnv
    form = body
    continue
  }
}

import { parse } from './parseTreeSitter.js'

function* parseToForms(content, filePath) {
  const mkMeta = filePath ? (row, column) => [filePath, row, column] : (row, column) => [row, column]
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
        const { startPosition, namedChildren } = node
        const { row, column } = startPosition
        const l = namedChildren.map(nodeToForm)
        l.metaData = Object.freeze(mkMeta(row + 1, column + 1))
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

startRepl('mini-lisp-history.json', 'mini-lisp> ', (line) => {
  try {
    let result
    for (const form of parseToForms(line)) result = directEval(env, form)
    console.log(result)
  } catch (err) {
    console.error(err)
  }
})
