import fs from 'fs'
import { readFile } from '../mini-lisp.js'

const forms = [...readFile('../wuns/comp-test-data.wuns')]

import { compileTopForms } from '../compiler-js.js'

const output = compileTopForms(forms)

import * as prettier from 'prettier'

const code = `import externs from '../externs.js'\n` + output
const prettierOptions = {
  singleQuote: true,
  trailingComma: 'all',
  semi: false,
  printWidth: 120,
  parser: 'babel',
}
fs.writeFileSync('test/comp-test-data.js', await prettier.format(code, prettierOptions))
