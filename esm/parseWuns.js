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
const lexOneUTF16 = getVarObject('lex-one-utf16').getValue()
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

for (const [expected, input] of [
  [[], ''],
  [[{ kind: 'word', length: 3 }], 'abc'],
  [
    [
      { kind: 'word', length: 3 },
      { kind: 'wspc', length: 1 },
      { kind: 'word', length: 4 },
    ],
    'abc 1234',
  ],
  [
    [
      { kind: 'word', length: 13 },
      { kind: 'wspc', length: 1 },
      { kind: 'word', length: 3 },
      { kind: 'wspc', length: 1 },
      { kind: 'ille', length: 3 },
    ],
    'fun-with-dash 345 ILL',
  ],
  [
    [
      { kind: 'lsqb', length: 1 },
      { kind: 'word', length: 4 },
      { kind: 'wspc', length: 1 },
      { kind: 'word', length: 1 },
      { kind: 'wspc', length: 1 },
      { kind: 'word', length: 1 },
      { kind: 'rsqb', length: 1 },
    ],
    '[list 1 2]',
  ],
  [[{ kind: 'word', length: 1 }], 'w'],
  [[{ kind: 'ille', length: 1 }], 'W'],
  [[{ kind: 'ille', length: 1 }], 'ø'],
  [[{ kind: 'ille', length: 2 }], '😀'],
]) {
  const buffer16 = new Uint16Array(memory.buffer, bufferNum, 64)
  let i = 0
  while (i < input.length) {
    buffer16[i] = input.charCodeAt(i)
    i++
  }
  const end = bufferNum + input.length * 2
  let cur = bufferNum
  // console.log({ end, cur })
  let totalTokenLength = 0
  let expectedIndex = 0
  while (true) {
    if (cur >= end) break
    const [kind, lw] = apply(lexOneUTF16, cur, end)
    // console.log({ kind, lw })
    const length = parseInt(lw)
    const e = expected[expectedIndex++]
    if (e.kind !== wordValue(kind)||e.length !== length/2) {
      console.log({ input, e, kind, length })
      throw new Error('length mismatch')
    }
    // console.log({ kind: String(kind), length, ldiv2: length / 2 })
    cur += length
    totalTokenLength += length
  }
  if (totalTokenLength !== input.length * 2) {
    console.log('totalTokenLength:', totalTokenLength)
    console.log('input.length * 2:', input.length)
    throw new Error('totalTokenLength !== input.length * 2')
  }
}
