import { wordValue } from './core.js'
import { makeInterpreterContext, apply } from './interpreter.js'
// import { callClosure } from './core.js'

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

const stringInputHandles = new Map()

env['read'] = (memoryIndex, handle, p, l) => {
  const memory = getMemory(memoryIndex)
  if (!memory) throw new Error('memory not found: ' + memoryIndex)
  const inputObj = stringInputHandles.get(handle)
  if (!inputObj) throw new Error('string handle not found: ' + handle)
  const { input, readChars } = inputObj
  const buffer = new Uint8Array(memory.buffer, p, l)
  const { written, read } = textEncoder.encodeInto(input.slice(readChars), buffer)
  // console.log(`read: ${read}, written: ${written}`)
  inputObj.readChars += read
  return written
}

const byteInputHandles = new Map()

env['read-bytes'] = (memoryIndex, handle, p, l) => {
  const memory = getMemory(memoryIndex)
  if (!memory) throw new Error('memory not found: ' + memoryIndex)
  const inputObj = byteInputHandles.get(wordValue(handle))
  if (!inputObj) throw new Error('binary handle not found: ' + handle)
  const { bytes, offset } = inputObj
  const buffer = new Uint8Array(memory.buffer, p, l)
  const slice = bytes.slice(offset, offset + l)
  buffer.set(slice)
  inputObj.offset += slice.length
  return slice.length
}
parseEvalFile('std3.wuns')
parseEvalFile('np.wuns')
const { getVarObject } = context
apply(getVarObject('bump-alloc-init').getValue())
const parse = getVarObject('parse').getValue()
const lexOne = getVarObject('lex-one').getValue()
const bumpAlloc = getVarObject('bump-alloc').getValue()

// for (const input of ['']) {
//   console.log('evaluating:', input)
//   // parseEvalFile(input)
//   const handle = stringInputHandles.size
//   stringInputHandles.set(handle, { readChars: 0, input })
//   callClosure(parse, [handle])
// }

const bufferWord = apply(bumpAlloc, 64)
// console.log('buffer:', bufferWord)
const bufferNum = parseInt(bufferWord)
const memory = getMemory(0)

for (const input of ['', 'abc', 'abc 123', 'fun-with-dash 345 ILL', '[list 1 2]']) {
  const buffer = new Uint8Array(memory.buffer, bufferNum, 64)
  const { read, written } = textEncoder.encodeInto(input, buffer)
  let cur = bufferNum
  console.log({ input })

  while (true) {
    if (cur >= bufferNum + written) break
    const [kind, lw] = apply(lexOne, cur, cur + written)
    const length = parseInt(lw)
    console.log({ kind: String(kind), length })
    cur += (length)
  }
  console.log('')
  // const handle = byteInputHandles.size
  // byteInputHandles.set(String(handle), { bytes: textEncoder.encode(input), offset: 0 })
  // apply(parse, handle, 64)
}

// const commandLineArgs = process.argv.slice(2)

// for (const arg of commandLineArgs) {
//   console.log('evaluating:', arg)
//   parseEvalFile(arg)
// }

// runRepl(context)
