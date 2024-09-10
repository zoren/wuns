import { makeInitContext, runCform, jsHost } from './interpreter.js'

const { parseEvalFiles, parseFileToList, parseFirstForm, evaluate } = makeInitContext(jsHost)

const wunsFiles = ['std3', 'macro-expand', 'infer', 'test'].map((name) => `../wuns/${name}.wuns`)

parseEvalFiles(wunsFiles)

// do type inference on the standard library
const std3 = parseFileToList('../wuns/std3.wuns')

const formWord = parseFirstForm('test-infer')

const testInfer = evaluate(formWord)

runCform(() => {
  const res = testInfer(std3)
  console.log({ res })
})
