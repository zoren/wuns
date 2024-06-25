import { unit, isSigned32BitInteger } from './core.js'

const instructions = {}

const addI32Instruction = (name, f) => {
  instructions[name] = f
  instructions['i32.' + name] = f
}
const i32binops = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  rem: '%',

  eq: '===',
  ne: '!==',

  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',
}

for (const [name, op] of Object.entries(i32binops)) {
  addI32Instruction(name, Function('a', 'b', `return (a ${op} b) | 0`))
}

const i32BitwiseOps = [
  { name: 'and', op: '&', alias: 'bitwise-and' },
  { name: 'or', op: '|', alias: 'bitwise-ior' },
  { name: 'xor', op: '^', alias: 'bitwise-xor' },
  { name: 'shl', op: '<<', alias: 'bitwise-shift-left' },
  { name: 'shr_s', op: '>>', alias: 'bitwise-shift-right' },
  { name: 'shr_u', op: '>>>', alias: 'bitwise-shift-right-unsigned' },
]
for (const { name, op, alias } of i32BitwiseOps) {
  const f = Function('a', 'b', `return (a ${op} b) | 0`)
  addI32Instruction(name, f)
  addI32Instruction(alias, f)
}
const u32 = 'u32'
const i32 = 'i32'
const validateImmediateMemArgs = (memoryIndex, align, offset) => {
  if (memoryIndex < 0 || !isSigned32BitInteger(memoryIndex)) throw new Error('invalid memory index')
  if (align < 0 || !isSigned32BitInteger(align)) throw new Error('invalid alignment')
  if (align !== 2) throw new Error('unsupported alignment')
  if (offset < 0 || !isSigned32BitInteger(offset)) throw new Error('invalid offset')
}
const calcAddr = (memory, offset, addr) => {
  const effectiveAddr = (addr + offset) | 0
  if (effectiveAddr < 0) throw new Error('address out of bounds')
  if (effectiveAddr + 4 > memory.buffer.byteLength) throw new Error('address out of bounds')
  if ((effectiveAddr | 0) !== effectiveAddr) throw new Error('address not aligned')
  if (effectiveAddr & 3) throw new Error('address not aligned')
  return effectiveAddr / 4
}
const load = (memoryIndex, align, offset) => {
  validateImmediateMemArgs(memoryIndex, align, offset)
  return ({ memories }, addr) => {
    const memory = memories[memoryIndex]
    if (!memory) throw new Error('memory not found: ' + memoryIndex)
    const buffer = new Int32Array(memory.buffer)
    return buffer[calcAddr(memory, offset, addr)]
  }
}
addI32Instruction('load', {
  immediateParams: [u32, u32, u32],
  params: [i32],
  func: load,
})
const store = (memoryIndex, align, offset) => {
  validateImmediateMemArgs(memoryIndex, align, offset)
  return ({ memories }, addr, val) => {
    const memory = memories[memoryIndex]
    if (!memory) throw new Error('memory not found: ' + memoryIndex)
    const buffer = new Int32Array(memory.buffer)
    buffer[calcAddr(memory, offset, addr)] = val
    return unit
  }
}
addI32Instruction('store', {
  immediateParams: [u32, u32, u32],
  params: [i32, i32],
  func: store,
})

Object.freeze(instructions)
export { instructions }
