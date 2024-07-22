import { wordValue } from './core.js'
import { makeInterpreterContext, apply } from './interpreter.js'

const memory = new WebAssembly.Memory({ initial: 1 })
const importObject = {
  env: {
    mem: memory,
  }
}
const context = makeInterpreterContext({ importObject })
const { parseEvalFile } = context

const textDecoder = new TextDecoder()

parseEvalFile('np.wuns')
const { getVarObject } = context
const getVarVal = (name) => getVarObject(name).getValue()
apply(getVarVal('bump-alloc-init'))
const bumpAlloc = getVarVal('bump-alloc')

const bufferWord = apply(bumpAlloc, 64)
const bufferNum = parseInt(bufferWord)

const lexOneUTF16 = getVarVal('lex-one-utf16')
let assertCount = 0
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
  assertCount++
}

import assert from 'node:assert'

const parse = getVarVal('parse')
const nodeSize = getVarVal('get-node-size')
const nodeTag = getVarVal('get-node-tag')
const nodeNumberOfChildren = getVarVal('get-node-number-of-children')
const nodeChild = getVarVal('get-node-child')

const dumpToken = (tokenP, indent = '') => {
  const tag = +apply(nodeTag, tokenP)
  const size = +apply(nodeSize, tokenP) / 2
  const numberOfChildren = +apply(nodeNumberOfChildren, tokenP)
  console.log(`${indent}tag: ${tag}, size: ${size} children: ${numberOfChildren}`)
  if (numberOfChildren) {
    const newIndent = indent + '  '
    for (let j = 0; j < numberOfChildren; j++) dumpToken(apply(nodeChild, tokenP, j), newIndent)
  }
}
const tagToString = (tag) => {
  const buffer = new ArrayBuffer(4)
  new DataView(buffer).setUint32(0, tag, false)
  return textDecoder.decode(new Uint8Array(buffer))
}
const nodeP2Struct = (tokenP) => {
  const tag = +apply(nodeTag, tokenP)
  const size = +apply(nodeSize, tokenP) / 2
  const numberOfChildren = +apply(nodeNumberOfChildren, tokenP)
  const obj = { tag: tagToString(tag), size }
  if (numberOfChildren) {
    const children = []
    for (let j = 0; j < numberOfChildren; j++) children.push(nodeP2Struct(apply(nodeChild, tokenP, j)))
    obj.children = children
  }
  return obj
}

const treeToForms = getVarVal('tree-to-forms')
const size = getVarVal('get-size')
const at = getVarVal('at-i32')
const isWord = getVarVal('is-word-pointer')
const wordSize = getVarVal('word-size')
const wordPointer = getVarVal('word-pointer')

const isList = getVarVal('is-list-pointer')
const listSize = getVarVal('list-size')
const tag = getVarVal('tag')
const atAllocList = getVarVal('at-alloc-list')
const print = getVarVal('print')
const printParen = getVarVal('print-paren')
const bufferPointer = getVarVal('get-buffer-pointer')

const dumpForm = (formP, indent = '') => {
  if (+apply(isWord, formP)) {
    const size = +apply(wordSize, formP)
    const pointer = +apply(wordPointer, formP)
    const buffer = new Uint8Array(memory.buffer, pointer, size)
    const str = textDecoder.decode(buffer)
    console.log(`${indent}word(${size}): ${str}`)
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

const form2StringArray = (formP) => {
  if (+apply(isWord, formP)) {
    const size = +apply(wordSize, formP)
    const pointer = +apply(wordPointer, formP)
    const buffer = new Uint8Array(memory.buffer, pointer, size)
    return textDecoder.decode(buffer)
  }
  if (+apply(isList, formP)) {
    const size = +apply(listSize, formP)
    const children = []
    for (let j = 0; j < size; j++) children.push(form2StringArray(apply(atAllocList, formP, j)))
    return children
  }
  throw new Error('unexpected form: ' + formP)
}
const tests = [
  {
    expectedPP: [],
    expectedForms: [],
    expected: {
      tag: 'root',
      size: 0,
    },
    input: '',
  },
  {
    expectedPP: ['a'],
    expectedForms: ['a'],
    expected: {
      tag: 'root',
      size: 1,
      children: [
        {
          tag: 'word',
          size: 1,
        },
      ],
    },
    input: 'a',
  },
  {
    expectedPP: [],
    expectedForms: [],
    expected: {
      tag: 'root',
      size: 1,
      children: [
        {
          tag: 'wspc',
          size: 1,
        },
      ],
    },
    input: ' ',
  },
  {
    expectedPP: [],
    expectedForms: [],
    expected: {
      tag: 'root',
      size: 1,
      children: [
        {
          tag: 'ille',
          size: 1,
        },
      ],
    },
    input: 'Z',
  },
  {
    expectedPP: [],
    expectedForms: [],
    expected: {
      tag: 'root',
      size: 2,
      children: [
        {
          tag: 'ille',
          size: 2,
        },
      ],
    },
    input: '😀',
  },
  {
    expectedPP: [],
    expectedForms: [],
    expected: {
      tag: 'root',
      size: 4,
      children: [
        {
          tag: 'ille',
          size: 4,
        },
      ],
    },
    input: '🧜🏾',
  },
  {
    expectedPP: ['abc'],
    expectedForms: ['abc'],
    expected: {
      tag: 'root',
      size: 3,
      children: [
        {
          tag: 'word',
          size: 3,
        },
      ],
    },
    input: 'abc',
  },
  {
    expectedPP: ['abc', '12345'],
    expectedForms: ['abc', '12345'],
    expected: {
      tag: 'root',
      size: 9,
      children: [
        {
          tag: 'word',
          size: 3,
        },
        {
          tag: 'wspc',
          size: 1,
        },
        {
          tag: 'word',
          size: 5,
        },
      ],
    },
    input: 'abc 12345',
  },

  {
    expectedPP: ['bla', 'df'],
    expectedForms: ['bla', 'df'],
    expected: {
      tag: 'root',
      size: 14,
      children: [
        {
          tag: 'word',
          size: 3,
        },
        {
          tag: 'wspc',
          size: 1,
        },
        {
          tag: 'ille',
          size: 7,
        },
        {
          tag: 'wspc',
          size: 1,
        },
        {
          tag: 'word',
          size: 2,
        },
      ],
    },
    input: 'bla ILLEGAL df',
  },
  {
    expectedPP: ['[]'],
    expectedForms: [[]],
    expected: {
      tag: 'root',
      size: 2,
      children: [
        {
          tag: 'list',
          size: 2,
          children: [
            { tag: 'lsqb', size: 1 },
            { tag: 'rsqb', size: 1 },
          ],
        },
      ],
    },
    input: '[]',
  },
  {
    expectedPP: ['[a]'],
    expectedForms: [['a']],
    expected: {
      tag: 'root',
      size: 3,
      children: [
        {
          tag: 'list',
          size: 3,
          children: [
            { tag: 'lsqb', size: 1 },
            { tag: 'word', size: 1 },
            { tag: 'rsqb', size: 1 },
          ],
        },
      ],
    },
    input: '[a]',
  },
  {
    expectedPP: ['[abcd 123]'],
    expectedForms: [['abcd', '123']],
    expected: {
      tag: 'root',
      size: 10,
      children: [
        {
          tag: 'list',
          size: 10,
          children: [
            { tag: 'lsqb', size: 1 },
            { tag: 'word', size: 4 },
            { tag: 'wspc', size: 1 },
            { tag: 'word', size: 3 },
            { tag: 'rsqb', size: 1 },
          ],
        },
      ],
    },
    input: '[abcd 123]',
  },
  {
    expectedPP: ['hej'],
    expectedForms: ['hej'],
    expected: {
      tag: 'root',
      size: 5,
      children: [
        { tag: 'word', size: 3 },
        { tag: 'wspc', size: 2 },
      ],
    },
    input: 'hej  ',
  },
  {
    expectedPP: ['[]'],
    expectedForms: [[]],
    expected: {
      tag: 'root',
      size: 1,
      children: [
        {
          tag: 'list',
          size: 1,
          children: [{ tag: 'lsqb', size: 1 }],
        },
      ],
    },
    input: '[',
  },
  {
    expectedPP: ['[[]]'],
    expectedForms: [[[]]],
    expected: {
      tag: 'root',
      size: 2,
      children: [
        {
          tag: 'list',
          size: 2,
          children: [
            { tag: 'lsqb', size: 1 },
            {
              tag: 'list',
              size: 1,
              children: [{ tag: 'lsqb', size: 1 }],
            },
          ],
        },
      ],
    },
    input: '[[',
  },
]
const buffer16 = new Uint16Array(memory.buffer, bufferNum, 64)

const copyInput = (input) => {
  let i = 0
  while (i < input.length) {
    buffer16[i] = input.charCodeAt(i)
    i++
  }
  const end = bufferNum + input.length * 2
  const cur = bufferNum
  return { cur, end }
}

for (const { expectedPP, expectedForms, expected, input } of tests) {
  const { cur, end } = copyInput(input)
  const rootNodeP = apply(parse, cur, end)

  const struct = nodeP2Struct(rootNodeP)
  assert.deepStrictEqual(struct, expected)

  const formsP = apply(treeToForms, cur, rootNodeP)
  const formsSize = +apply(size, formsP) / 4

  const topLevel = []
  for (let i = 0; i < formsSize; i++) {
    const formP = apply(at, formsP, i)
    const stringArray = form2StringArray(formP)
    topLevel.push(stringArray)
    const printP = +apply(print, formP)
    const buf = +apply(bufferPointer, printP)
    const printSize = +apply(size, printP)
    const buffer = new Uint8Array(memory.buffer, buf, printSize)
    const str = textDecoder.decode(buffer)
    assert.equal(str, expectedPP[i])
    assertCount++
  }
  assert.deepStrictEqual(topLevel, expectedForms)
}

console.log('assertCount:', assertCount)
