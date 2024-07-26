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
const s32 = 's32'
const i32 = 'i32'

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

addI32Instruction('const', {
  immediateParams: [s32],
  params: [],
  func: (val) => {
    if (!isSigned32BitInteger(val)) throw new Error('invalid immediate value')
    return () => val
  },
})
instructions['unreachable'] = () => {
  throw new Error('unreachable')
}
// The target memory and source segment are given as immediates.
// The instruction has the signature [i32 i32 i32] -> []. The parameters are, in order:

// top-2: destination address
// top-1: offset into the source segment
// top-0: size of memory region in bytes
// instructions['data.passive']
Object.freeze(instructions)
export { instructions }
