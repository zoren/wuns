import { setDefVar, getDefVarValue } from './core.js'
import { makeInterpreterContext, addHostFunctions, parseEvalFiles, runCform } from './interpreter.js'

const defVars = new Map()
addHostFunctions(defVars)
const compile = makeInterpreterContext(defVars)

import { parseFile } from './parseTreeSitter.js'

const makeEvalContext = () => {
  const clientDefVars = new Map()
  addHostFunctions(clientDefVars)
  setDefVar(clientDefVars, 'make-eval-context', makeEvalContext)
  const compile = makeInterpreterContext(clientDefVars)
  return {
    compile,
    apply: (fn, args) => {
      if (typeof fn !== 'function') throw new Error('apply expects function')
      return fn(...args)
    },
  }
}

setDefVar(defVars, 'make-eval-context', makeEvalContext)

const files = ['std3', 'wasm-instructions', 'macro-expand'].map((f) => `../wuns/${f}.wuns`)
parseEvalFiles(compile, files)

const testExpand = getDefVarValue(defVars, 'test-expand')

runCform(() => {
  testExpand()
})

const testExpandNoErrors = getDefVarValue(defVars, 'test-expand-no-errors-fn')

runCform(() => {
  testExpandNoErrors(['std3', 'wasm-instructions', 'macro-expand'].flatMap((f) => parseFile(`../wuns/${f}.wuns`)))
})
