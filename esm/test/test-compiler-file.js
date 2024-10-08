import fs from 'fs'
import { readFile } from '../mini-lisp.js'

const forms = [...readFile('../wuns/comp-test-data.wuns')]

import { compileTopForms } from '../compiler-js.js'

const output = compileTopForms(forms)

import * as prettier from "prettier";

const code = `import externs from '../externs.js'\n` + output
fs.writeFileSync('test/comp-test-data.js', await prettier.format(code, { semi: false, parser: "babel" }))
// fs.writeFileSync('test/comp-test-data.js', code)

// const formword = (word) => Object.freeze(['word', word])