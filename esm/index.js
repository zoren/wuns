import fs from 'fs'
import { makeEvaluator, parseEvalString } from './interpreter.js'
import { makeRepl } from './repl.js'
const commandLineArgs = process.argv.slice(2)
const evaluator = makeEvaluator()

if (commandLineArgs.length === 1) parseEvalString(evaluator, fs.readFileSync(commandLineArgs[0], 'utf8'))

const prompt = makeRepl(evaluator)
prompt()
