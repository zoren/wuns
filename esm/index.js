import { runRepl } from './repl.js'
import { makeInterpreterContext } from './interpreter.js'

const env = {
  mem: new WebAssembly.Memory({ initial: 1 }),
}
const importObject = {
  env,
}
const context = makeInterpreterContext({ importObject })
const { parseEvalFile, getMemory } = context

env['log-size-pointer'] = (memoryIndex, size, p) => {
  const memory = getMemory(memoryIndex)
  if (!memory) throw new RuntimeError('memory not found: ' + memoryIndex)
  const textDecoder = new TextDecoder()
  const buffer = new Uint8Array(memory.buffer)
  const segment = buffer.slice(p, p + size)
  const str = textDecoder.decode(segment)
  console.log(str)
}

const commandLineArgs = process.argv.slice(2)

for (const arg of commandLineArgs) {
  console.log('evaluating:', arg)
  parseEvalFile(arg)
}

runRepl(context)
