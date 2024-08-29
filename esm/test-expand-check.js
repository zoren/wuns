import { parseFile } from './parseTreeSitter.js'
import { makeGetDefVarValue } from './core.js'
import { makeInitContext, parseEvalFiles, runCform } from './interpreter.js'
{
  const { compile } = makeInitContext()

  const files = ['std3', 'wasm-instructions', 'macro-expand'].map((f) => `../wuns/${f}.wuns`)
  parseEvalFiles(compile, files)
  const getDefVarValue = makeGetDefVarValue(compile)

  const testExpand = getDefVarValue('test-expand')

  runCform(() => {
    testExpand()
  })

  const testExpandNoErrors = getDefVarValue('test-expand-no-errors-fn')

  runCform(() => {
    testExpandNoErrors(
      ['std3', 'wasm-instructions', 'macro-expand', 'check'].flatMap((f) => parseFile(`../wuns/${f}.wuns`)),
    )
  })
}
{
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
}

{
  const { compile } = makeInitContext()

  parseEvalFiles(
    compile,
    ['std3', 'wasm-instructions', 'macro-expand', 'check', 'infer'].map((name) => `../wuns/${name}.wuns`),
  )

  const getDefVarVal = makeGetDefVarValue(compile)
  const testCheck = getDefVarVal('test-check')
  runCform(() => {
    testCheck()
  })
}
