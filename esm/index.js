import { runRepl } from './repl.js'
import { makeInterpreterContext } from './interpreter.js'

const context = makeInterpreterContext()
const { parseEvalFile, addMemory } = context

const commandLineArgs = process.argv.slice(2)

for (const arg of commandLineArgs) {
  console.log('evaluating:', arg)
  parseEvalFile(arg)
}

runRepl(context)

addMemory(new WebAssembly.Memory({ initial: 1 }))
