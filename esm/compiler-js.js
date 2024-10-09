
import { makeDefEnv, evaluateFile, catchErrors } from './mini-lisp.js'
import { makeTaggedValue } from './core.js'

const defEnv = makeDefEnv('../wuns/', {
  js: jsExtern,
})

const wunsExports = evaluateFile(defEnv, 'compile-js.wuns')
const formToJs = wunsExports['compile-run']
// console.log({ jsStmt })
// const output = jsStmtToString(jsStmt)
const compileTopFormsDef = wunsExports['compile-top-forms']
const compileTopForms = (forms) => {
  return catchErrors(() => jsStmtToString(compileTopFormsDef(forms)))
}
export { formToJs, compileTopForms, jsStmtToString }
