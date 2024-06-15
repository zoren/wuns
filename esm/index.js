import { runRepl } from './repl.js'
import { makeContext } from './interpreter.js'

const context = makeContext()
const { parseEvalFile } = context

const commandLineArgs = process.argv.slice(2)

for (const arg of commandLineArgs) {
  console.log('evaluating:', arg)
  parseEvalFile(arg)
}

runRepl(context)
