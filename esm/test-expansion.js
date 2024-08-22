import { getDefVarValue } from './core.js'
import { makeInitContext, parseEvalFiles, runCform, hostFuncTypes } from './interpreter.js'

const { defVars, compile } = makeInitContext()


const files = ['std3', 'wasm-instructions', 'macro-expand'].map((f) => `../wuns/${f}.wuns`)
parseEvalFiles(compile, files)

const testExpand = getDefVarValue(defVars, 'test-expand')

runCform(() => {
  testExpand(hostFuncTypes)
})

const testExpandNoErrors = getDefVarValue(defVars, 'test-expand-no-errors-fn')
import { parseFile } from './parseTreeSitter.js'

runCform(() => {
  testExpandNoErrors(hostFuncTypes,[
    'std3',
    'wasm-instructions',
     'macro-expand'
    ].flatMap((f) => parseFile(`../wuns/${f}.wuns`)))
})
