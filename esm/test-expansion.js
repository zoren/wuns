import { makeInterpreterContext, addHostFunctions, parseEvalFile, runCform, isMacro } from './interpreter.js'

const defVars = new Map()
addHostFunctions(defVars)
const compile = makeInterpreterContext(defVars)
const defSetVar = (name, val) => {
  defVars.set(name, val)
}
const getVarVal = (name) => {
  if (defVars.has(name)) return defVars.get(name)
  console.log([...defVars.keys()])
  throw new Error('var not found: ' + name)
}
import { isList, isWord, wordValue } from './core.js'

const makeClientContext = () => {
  const clientDefVars = new Map()
  addHostFunctions(clientDefVars)
  const compile = makeInterpreterContext(clientDefVars)
  return {
    compile,
    'macro-expand': (form) => {
      if (!isList(form)) throw new Error('macro-expand expects list')
      if (form.length === 0) throw new Error('macro-expand expects list')
      const [first, ...rest] = form
      if (!isWord(first)) throw new Error('macro-expand expects list')
      const defVarVal = clientDefVars.get(wordValue(first))
      if (defVarVal === undefined) throw new Error('macro-expand expects defined word')
      if (typeof defVarVal !== 'function') throw new Error('macro-expand expects function')
      if (!isMacro(defVarVal)) throw new Error('macro-expand expects macro')
      return defVarVal(...rest)
    },
    'set-def-var': (name, val) => {
      clientDefVars.set(wordValue(name), val)
    },
    'def-var-val': (wname) => {
      const name = wordValue(wname)
      if (clientDefVars.has(name)) return clientDefVars.get(name)
      throw new Error('var not found: ' + name)
    },
  }
}

defSetVar('make-eval-context', makeClientContext)

for (const name of ['std3', 'wasm-instructions', 'macro-expand']) parseEvalFile(compile, `../wuns/${name}.wuns`)

runCform(() => {
  getVarVal('test-expand')()
})

// getVarVal('test-file')(parseFile(`../wuns/self-host.wuns`))
