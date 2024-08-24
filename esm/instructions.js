import { isSigned32BitInteger } from './core.js'

const instructions = {}
const empty = Object.freeze([])
const u32 = 'u32'
const s32 = 's32'
const s64 = 's64'
const i32 = 'i32'

const i32i32 = Object.freeze([i32, i32])
const mkZeroImm = (func) => {
  if (func.length !== 2) throw new Error('expected 2 params: ' + func.length)
  return Object.freeze({
    immediateParams: empty,
    params: i32i32,
    func: () => func,
  })
}
const addI32InstructionObj = (name, obj) => {
  instructions[name] = obj
  instructions['i32.' + name] = obj
}
const addI32InstructionFunc = (name, f) => {
  const obj = mkZeroImm(f)
  instructions[name] = obj
  instructions['i32.' + name] = obj
}
const i32binops = {
  add: '+',
  sub: '-',
  mul: '*',
  'div-s': '/',
  'rem-s': '%',

  eq: '===',
  ne: '!==',

  'lt-s': '<',
  'le-s': '<=',
  'gt-s': '>',
  'ge-s': '>=',
}

for (const [name, op] of Object.entries(i32binops)) {
  addI32InstructionFunc(name, Function('a', 'b', `return (a ${op} b) | 0`))
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
  addI32InstructionFunc(name, f)
  addI32InstructionFunc(alias, f)
}

addI32InstructionObj('const', {
  immediateParams: [s32],
  params: [],
  func: (val) => {
    const normalised = val | 0
    if (val !== normalised) throw new Error('invalid immediate value')
    // return the normalized value as -0 === 0
    return () => normalised
  },
})
instructions['i64.const'] = {
  immediateParams: [s64],
  params: [],
  func: (val) => {
    const bigInt = BigInt(val)
    return () => bigInt
  },
}
instructions['unreachable'] = Object.freeze({
  immediateParams: empty,
  params: empty,
  func: () => () => {
    throw new Error('unreachable')
  },
})
// The target memory and source segment are given as immediates.
// The instruction has the signature [i32 i32 i32] -> []. The parameters are, in order:

// top-2: destination address
// top-1: offset into the source segment
// top-0: size of memory region in bytes
// instructions['data.passive']
const typedArrayCtorByByteSizeSigned = (byteSize, signed) => {
  switch (byteSize) {
    case 1:
      return signed ? Int8Array : Uint8Array
    case 2:
      return signed ? Int16Array : Uint16Array
    case 4:
      return signed ? Int32Array : Uint32Array
    default:
      throw new Error('unsupported byte size')
  }
}

Object.freeze(instructions)

const instructionFunctions = {}
for (const [name, f] of Object.entries(instructions)) {
  if (f.immediateParams.length !== 0) continue
  instructionFunctions[name] = f.func()
}
Object.freeze(instructionFunctions)

export { instructions, instructionFunctions }
