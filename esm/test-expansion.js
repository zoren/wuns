import { makeGetDefVarValue } from './core.js'
import { makeInitContext, parseEvalFiles, runCform } from './interpreter.js'

const { compile } = makeInitContext()

const files = ['std3', 'wasm-instructions', 'macro-expand'].map((f) => `../wuns/${f}.wuns`)
parseEvalFiles(compile, files)
const getDefVarValue = makeGetDefVarValue(compile)

const testExpand = getDefVarValue('test-expand')

runCform(() => {
  testExpand()
})

const testExpandNoErrors = getDefVarValue('test-expand-no-errors-fn')
import { parseFile } from './parseTreeSitter.js'

runCform(() => {
  testExpandNoErrors(
    ['std3', 'wasm-instructions', 'macro-expand', 'check'].flatMap((f) => parseFile(`../wuns/${f}.wuns`)),
  )
})
