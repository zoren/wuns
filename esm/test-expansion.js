import { getDefVarValue } from './core.js'
import { makeInitContext, parseEvalFiles, runCform } from './interpreter.js'

const { defVars, compile } = makeInitContext()

import { parseFile } from './parseTreeSitter.js'

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
