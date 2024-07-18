import { wordValue } from './core.js'
import { makeInterpreterContext, apply } from './interpreter.js'

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
const getVarVal = (name) => getVarObject(name).getValue()
apply(getVarVal('bump-alloc-init'))
const bumpAlloc = getVarVal('bump-alloc')

const bufferWord = apply(bumpAlloc, 64)
// console.log('buffer:', bufferWord)
const bufferNum = parseInt(bufferWord)
const memory = getMemory(0)

const testList = getVarVal('test-list')
{
  const li = apply(testList)
  console.log({ li })
}

const lexOneUTF16 = getVarVal('lex-one-utf16')

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
  let totalTokenLength = 0
  let expectedIndex = 0
  while (true) {
    if (cur >= end) break
    const [kind, lw] = apply(lexOneUTF16, cur, end)
    const length = parseInt(lw)
    const e = expected[expectedIndex++]
    if (e.kind !== wordValue(kind) || e.length !== length / 2) {
      console.log({ input, e, kind, length })
      throw new Error('length mismatch')
    }
    cur += length
    totalTokenLength += length
  }
  if (totalTokenLength !== input.length * 2) {
    console.log('totalTokenLength:', totalTokenLength)
    console.log('input.length * 2:', input.length)
    throw new Error('totalTokenLength !== input.length * 2')
  }
}

{
  const parse = getVarVal('parse')
  const nodeSize = getVarVal('get-node-size')
  const nodeTag = getVarVal('get-node-tag')
  const nodeNumberOfChildren = getVarVal('get-node-number-of-children')
  const nodeChild = getVarVal('get-node-child')

  const bufferWord = apply(bumpAlloc, 64)
  const bufferNum = parseInt(bufferWord)

  const dumpToken = (tokenP, indent = '') => {
    const tag = +apply(nodeTag, tokenP)
    const size = +apply(nodeSize, tokenP) / 2
    console.log(`${indent}tag: ${tag}, size: ${size}`)
    if (tag === 5 || tag === 7) {
      const newIndent = indent + '  '
      for (let j = 0; j < +apply(nodeNumberOfChildren, tokenP); j++) dumpToken(apply(nodeChild, tokenP, j), newIndent)
    }
  }

  for (const input of ['', 'a', 'abc', 'abc 123', 'bla ILLEGAL df', '[]']) {
    console.log('evaluating:', input)
    const buffer16 = new Uint16Array(memory.buffer, bufferNum, 64)
    let i = 0
    while (i < input.length) {
      buffer16[i] = input.charCodeAt(i)
      i++
    }
    const end = bufferNum + input.length * 2
    let cur = bufferNum

    const rootNodeP = apply(parse, cur, end)
    dumpToken(rootNodeP)
    console.log()
  }

  const treeToForms = getVarVal('tree-to-forms')
  const size = getVarVal('get-size')
  const capacity = getVarVal('get-capacity')
  const at = getVarVal('at-i32')
  const isWord = getVarVal('is-word-pointer')
  const wordSize = getVarVal('word-size')
  const wordPointer = getVarVal('word-pointer')

  const isList = getVarVal('is-list-pointer')
  const listSize = getVarVal('list-size')
  const tag = getVarVal('tag')
  const atAllocList = getVarVal('at-alloc-list')
  const print = getVarVal('print')

  const dumpForm = (formP, indent = '') => {
    if (+apply(isWord, formP)) {
      const size = +apply(wordSize, formP)
      const pointer = +apply(wordPointer, formP)
      const buffer = new Uint16Array(memory.buffer, pointer, size / 2)
      const str = textDecoder.decode(buffer)
      console.log(`${indent}word(${size},${size / 2}): ${str}`)
      return
    }
    if (+apply(isList, formP)) {
      const size = +apply(listSize, formP)
      console.log(`${indent}list: ${size}`)
      const newIndent = indent + '  '
      for (let j = 0; j < size; j++) {
        const child = apply(atAllocList, formP, j)
        dumpForm(child, newIndent)
      }
      return
    }
    console.log(apply(tag, formP))
    throw new Error('unexpected form: ' + formP)
  }

  for (const input of [
    '',
    'a',
    'abc',
    'abc 123',
    '[]',
    '[list IL ab]',
    '[[af f] 3 [list 2 53 /]]',
    '[a',
    '[[abc',
    'hej  ',
    '[[ILDB@ sdf',
  ]) {
    console.log('evaluating:', input)
    const buffer16 = new Uint16Array(memory.buffer, bufferNum, 64)
    let i = 0
    while (i < input.length) {
      buffer16[i] = input.charCodeAt(i)
      i++
    }
    const end = bufferNum + input.length * 2
    let cur = bufferNum

    const rootNodeP = apply(parse, cur, end)

    dumpToken(rootNodeP)
    const formsP = apply(treeToForms, cur, rootNodeP)
    const formsSize = +apply(size, formsP) / 4
    console.log('formsSize:', formsSize)

    for (let i = 0; i < formsSize; i++) {
      const formP = apply(at, formsP, i)
      dumpForm(formP)
      const printP = +apply(print, formP)
      console.log('print:', { printP, capacity: +apply(capacity, printP) })
      const printSize = +apply(size, printP)
      console.log('printSize:', { printSize })
      console.log()
    }
  }
}
