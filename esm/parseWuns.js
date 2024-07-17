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
const bumpAlloc = getVarObject('bump-alloc').getValue()

const bufferWord = apply(bumpAlloc, 64)
// console.log('buffer:', bufferWord)
const bufferNum = parseInt(bufferWord)
const memory = getMemory(0)


const testList = getVarObject('test-list').getValue()
{
  const li = apply(testList)
  console.log({ li })
}

const lexOneUTF16 = getVarObject('lex-one-utf16').getValue()

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
    if (e.kind !== wordValue(kind) || e.length !== length / 2) {
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

{
  const parse = getVarObject('parse').getValue()
  const nodeSize = getVarObject('get-node-size').getValue()
  const nodeTag = getVarObject('get-node-tag').getValue()
  const nodeNumberOfChildren = getVarObject('get-node-number-of-children').getValue()
  const nodeChild = getVarObject('get-node-child').getValue()

  const bufferWord = apply(bumpAlloc, 64)
  // console.log('buffer:', bufferWord)
  const bufferNum = parseInt(bufferWord)

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

    const go = (tokenP, indent = '') => {
      const tag = +apply(nodeTag, tokenP)
      const size = +apply(nodeSize, tokenP) / 2
      console.log(`${indent}tag: ${tag}, size: ${size}`)
      if (tag === 5 || tag === 7)
        for (let j = 0; j < +apply(nodeNumberOfChildren, tokenP); j++) go(apply(nodeChild, tokenP, j), indent + '  ')
    }
    go(rootNodeP)
    console.log()
  }

  const treeToForms = getVarObject('tree-to-forms').getValue()
  const nodeToForm = getVarObject('node-to-form').getValue()
  const size = getVarObject('get-size').getValue()
  const at = getVarObject('at-i32').getValue()
  const isWord = getVarObject('is-word-pointer').getValue()
  const wordSize = getVarObject('word-size').getValue()
  const wordPointer = getVarObject('word-pointer').getValue()

  const isList = getVarObject('is-list-pointer').getValue()
  const listSize = getVarObject('list-size').getValue()
  const tag = getVarObject('tag').getValue()
  const atAllocList = getVarObject('at-alloc-list').getValue()
  const print = getVarObject('print').getValue()

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

    const go = (tokenP, indent = '') => {
      const tag = +apply(nodeTag, tokenP)
      const size = +apply(nodeSize, tokenP) / 2
      console.log(`${indent}tag: ${tag}, size: ${size}`)
      if (tag === 5 || tag === 7)
        for (let j = 0; j < +apply(nodeNumberOfChildren, tokenP); j++) go(apply(nodeChild, tokenP, j), indent + '  ')
    }
    go(rootNodeP)
    const formsP = apply(treeToForms, cur, rootNodeP)
    const formsSize = +apply(size, formsP) / 4
    console.log('formsSize:', formsSize)

    const dumpForm = (formP, indent = '') => {
      if (+apply(isWord, formP)) {
        const size = +apply(wordSize, formP)
        const pointer = +apply(wordPointer, formP)
        // console.log({ size, pointer })
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

    for (let i = 0; i < formsSize; i++) {
      const formP = apply(at, formsP, i)
      dumpForm(formP)
      const printP = apply(print, formP)
      const printSize = +apply(size, printP)
      console.log('printSize:', {printP, printSize})
      console.log()
    }
  }
}
