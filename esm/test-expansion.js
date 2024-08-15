import { makeInitInterpreter, parseEvalFile, runCform, isMacro } from './interpreter.js'

const ctx = makeInitInterpreter()
const { getVarVal, defSetVar } = ctx

import { isWord, wordValue, print } from './core.js'


{
  const macroCtx = makeInitInterpreter()
  // macroCtx.defSetVar('log', (form) => {
  //   console.log('macro context logged:', print(form))
  // })
  for (const name of ['std3', 'self-host-macros']) parseEvalFile(macroCtx, `../wuns/${name}.wuns`)
  const { getVarVal } = macroCtx
  const hostTryGetMacro = (word) => {
    if (isWord(word)) {
      const n = wordValue(word)
      const val = getVarVal(n)
      if (n === 'defnt') {
        console.log('defnt found', args)
        return (...args) => {
          console.log('defnt called', args)
          return val(...args)
        }
      }
      if (isMacro(val)) return val
    }
    return 0
  }
  defSetVar('host-try-get-macro', hostTryGetMacro)
}

for (const name of ['std3', 'wasm-instructions', 'macro-expand']) parseEvalFile(ctx, `../wuns/${name}.wuns`)

runCform(() => {
  getVarVal('test-expand')()
})

// getVarVal('test-file')(parseFile(`../wuns/self-host.wuns`))
