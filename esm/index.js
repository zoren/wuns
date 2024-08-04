import { runRepl } from './repl.js'
import { makeInterpreterContext,initInterpreterEnv, parseEvalFile } from './interpreter.js'

const context = makeInterpreterContext()
initInterpreterEnv(context)

const commandLineArgs = process.argv.slice(2)

for (const arg of commandLineArgs) {
  console.log('evaluating:', arg)
  parseEvalFile(context, arg)
}

runRepl(context)
