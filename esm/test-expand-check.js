import { makeInitContext, parseEvalFiles, runCform } from './interpreter.js'
import { makeGetDefVarValue } from './core.js'
const { compile } = makeInitContext()

parseEvalFiles(
  compile,
  ['std3', 'wasm-instructions', 'macro-expand', 'check'].map((name) => `../wuns/${name}.wuns`),
)

const getDefVarVal = makeGetDefVarValue(compile)
const testCheck = getDefVarVal('test-check')
runCform(() => {
  testCheck()
})
