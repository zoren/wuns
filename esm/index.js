import { runRepl } from './repl.js'
import { parseEvalFile } from './interpreter.js'

const commandLineArgs = process.argv.slice(2)

if (commandLineArgs.length === 1) parseEvalFile(commandLineArgs[0])

runRepl()
