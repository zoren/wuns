import { parseFile } from './parseTreeSitter.js'
import { makeGetDefVarValue } from './core.js'
import { makeInitContext, parseEvalFiles, runCform } from './interpreter.js'

const { compile } = makeInitContext()

const wunsFiles = ['std3', 'macro-expand', 'infer', 'test'].map((name) => `../wuns/${name}.wuns`)
parseEvalFiles(compile, wunsFiles)

const getDefVarVal = makeGetDefVarValue(compile)
const testInfer = getDefVarVal('test-infer')
const std3 = [...parseFile('../wuns/std3.wuns')]

runCform(() => {
  const res = testInfer(std3)
  console.log({ res })
})
