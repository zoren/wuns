import path from 'node:path'
import fs from 'node:fs'
import { parseStringToForms } from './parse.js'
import { meta, print } from './core.js'
import { defineImportFunction, parseEvalFile, getGlobal, apply } from './interpreter.js'
defineImportFunction('log', (form) => {
  console.log('check: ' + print(form))
})

defineImportFunction('report-error', (msg, form) => {
  if (!Array.isArray(msg)) throw new Error('msg is not an array')
  const metaData = meta(form)
  if (!metaData) throw new Error('meta is ' + metaData)
  const [_, range] = metaData
  if (!Array.isArray(range)) throw new Error('range is not an array ' + print(form) + ' ' + print(metaData))
  const [startRow, startCol, endRow, endCol] = range
  console.log('report-error', `${startRow}:${startCol}-${endRow}:${endCol}`, msg.map(print).join(' '))
})
const __dirname = path.dirname(new URL(import.meta.url).pathname)
const wunsDir = path.resolve(__dirname, '..', 'wuns')
parseEvalFile(path.resolve(wunsDir, 'compiler-js.wuns'))

const inputFile = path.resolve(wunsDir, 'input.wuns')
const content = fs.readFileSync(inputFile, 'utf8')
const forms = parseStringToForms(content)

try {
  const outfun = getGlobal('compile-forms')
  apply(outfun, [forms])
  console.log('done compilikng: ' + forms.length)
} catch (e) {
  console.error('error evaluating compiler', e)
}
