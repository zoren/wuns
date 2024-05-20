import fs from 'fs'
import { defineImportFunction, makeEvaluator, parseEvalString } from './interpreter.js'
import { meta, print } from './core.js'

import { makeRepl } from './repl.js'
defineImportFunction('report_error', (msg, form) => {
  if (!Array.isArray(msg)) throw new Error('msg is not an array')
  const metaData = meta(form)
  if (!metaData) throw new Error('meta is ' + metaData)
  const [_, range] = metaData
  if (!Array.isArray(range)) {
    console.log('metaData', metaData)
    console.log('form', form)
    console.log('range', range)
    throw new Error('range is not an array ' + print(form) + ' ' + print(metaData))
  }
  console.log('check error:', msg.map(print).join(' '))
})

const evaluator = makeEvaluator()
parseEvalString(evaluator, fs.readFileSync('../wuns/check.wuns', 'utf8'))
const prompt = makeRepl(evaluator)
prompt()
