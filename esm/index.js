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

const textDecoder = new TextDecoder()

env['log-size-pointer'] = (memoryIndex, size, p) => {
  const memory = getMemory(memoryIndex)
  if (!memory) throw new RuntimeError('memory not found: ' + memoryIndex)
  const buffer = new Uint8Array(memory.buffer, p, size)
  const str = textDecoder.decode(buffer)
  console.log(str)
}

const textEncoder = new TextEncoder()

const inputs = new Map()

inputs.set(0, { readChars: 0, input: '' })

env['read'] = (memoryIndex, handle, p, l) => {
  const memory = getMemory(memoryIndex)
  if (!memory) throw new RuntimeError('memory not found: ' + memoryIndex)
  const inputObj = inputs.get(handle)
  const {input, readChars} = inputObj
  const buffer = new Uint8Array(memory.buffer, p, l)
  const { written, read } = textEncoder.encodeInto(input.slice(readChars), buffer)
  console.log(`read: ${read}, written: ${written}`)
  inputObj.readChars += read
  return [0, written]
}

const commandLineArgs = process.argv.slice(2)

for (const arg of commandLineArgs) {
  console.log('evaluating:', arg)
  parseEvalFile(arg)
}

runRepl(context)
