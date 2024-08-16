import { setDefVar, getDefVarValue } from './core.js'
import { makeInterpreterContext, addHostFunctions, parseEvalFiles, runCform } from './interpreter.js'

const defVars = new Map()
addHostFunctions(defVars)
const compile = makeInterpreterContext(defVars)

import { parseFile } from './parseTreeSitter.js'

const makeClientContext = () => {
  const clientDefVars = new Map()
  addHostFunctions(clientDefVars)
  const compile = makeInterpreterContext(clientDefVars)
  return {
    compile,
    apply: (fn, args) => {
      if (typeof fn !== 'function') throw new Error('apply expects function')
      return fn(...args)
    },
  }
}

setDefVar(defVars, 'make-eval-context', makeClientContext)

parseEvalFiles(compile, ['std3',
  'wasm-instructions',
  'macro-expand'
].map(f => `../wuns/${f}.wuns`));

const testExpand = getDefVarValue(defVars, 'test-expand')

runCform(() => {
  testExpand()
})

const testExpandNoErrors = getDefVarValue(defVars, 'test-expand-no-errors-fn')

const std3Forms = parseFile(`../wuns/std3.wuns`)

runCform(() => {
  testExpandNoErrors(std3Forms)
})

// getVarVal('test-file')(parseFile(`../wuns/self-host.wuns`))
