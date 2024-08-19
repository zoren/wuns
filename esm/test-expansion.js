import { getDefVarValue } from './core.js'
import { makeInitContext, parseEvalFiles, runCform, hostFuncs } from './interpreter.js'

const { defVars, compile } = makeInitContext()


const files = ['std3', 'wasm-instructions', 'macro-expand'].map((f) => `../wuns/${f}.wuns`)
parseEvalFiles(compile, files)

const testExpand = getDefVarValue(defVars, 'test-expand')

runCform(() => {
  testExpand(hostFuncs)
})

const testExpandNoErrors = getDefVarValue(defVars, 'test-expand-no-errors-fn')
import { parseFile } from './parseTreeSitter.js'

runCform(() => {
  testExpandNoErrors(hostFuncs,[
    'std3',
    // 'wasm-instructions',
    //  'macro-expand'
    ].flatMap((f) => parseFile(`../wuns/${f}.wuns`)))
})
