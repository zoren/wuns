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
const validateImmediateMemArgs = (memoryIndex, align, offset) => {
  if (memoryIndex < 0 || !isSigned32BitInteger(memoryIndex)) throw new Error('invalid memory index')
  if (align < 0 || !isSigned32BitInteger(align)) throw new Error('invalid alignment')
  // if (align !== 2) throw new Error('unsupported alignment')
  if (offset < 0 || !isSigned32BitInteger(offset)) throw new Error('invalid offset')
}
const calcAddr = (memory, addr, offset, byteSize) => {
  const effectiveAddr = (addr + offset) | 0
  if (effectiveAddr < 0) throw new Error('address out of bounds')
  if (effectiveAddr + byteSize > memory.buffer.byteLength) throw new Error('address out of bounds')
  if (!isSigned32BitInteger(effectiveAddr)) throw new Error('address not aligned: ' + effectiveAddr)
  if (effectiveAddr & (byteSize - 1)) throw new Error('address not aligned')
  return effectiveAddr / byteSize
}

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

const load = (byteSize, signed) => {
  const tArCtor = typedArrayCtorByByteSizeSigned(byteSize, signed)
  return (memoryIndex, align, offset) => {
    validateImmediateMemArgs(memoryIndex, align, offset)
    return ({ memories }, addr) => {
      const memory = memories[memoryIndex]
      if (!memory) throw new Error('memory not found: ' + memoryIndex)
      const buffer = new tArCtor(memory.buffer)
      return buffer[calcAddr(memory, addr, offset, byteSize)]
    }
  }
}
addI32Instruction('load', {
  immediateParams: [u32, u32, u32],
  params: [i32],
  func: load(4, true),
})
addI32Instruction('load8-s', {
  immediateParams: [u32, u32, u32],
  params: [i32],
  func: load(1, true),
})
addI32Instruction('load8-u', {
  immediateParams: [u32, u32, u32],
  params: [i32],
  func: load(1, false),
})
addI32Instruction('load16-s', {
  immediateParams: [u32, u32, u32],
  params: [i32],
  func: load(2, true),
})
addI32Instruction('load16-u', {
  immediateParams: [u32, u32, u32],
  params: [i32],
  func: load(2, false),
})
const store = (byteSize, signed) => {
  const tArCtor = typedArrayCtorByByteSizeSigned(byteSize, signed)
  return (memoryIndex, align, offset) => {
    validateImmediateMemArgs(memoryIndex, align, offset)
    return ({ memories }, addr, val) => {
      const memory = memories[memoryIndex]
      if (!memory) throw new Error('memory not found: ' + memoryIndex)
      const buffer = new tArCtor(memory.buffer)
      buffer[calcAddr(memory, addr, offset, byteSize)] = val
      return unit
    }
  }
}
addI32Instruction('store', {
  immediateParams: [u32, u32, u32],
  params: [i32, i32],
  func: store(4, true),
})
addI32Instruction('store8', {
  immediateParams: [u32, u32, u32],
  params: [i32, i32],
  func: store(1, true),
})
instructions['memory.size'] = {
  immediateParams: [u32],
  params: [],
  func:
    (memoryIndex) =>
    ({ memories }) => {
      const memory = memories[memoryIndex]
      if (!memory) throw new Error('memory not found: ' + memoryIndex)
      return memory.buffer.byteLength >> 16
    },
}
instructions['memory.grow'] = {
  immediateParams: [u32],
  params: [i32],
  func:
    (memoryIndex, delta) =>
    ({ memories }) => {
      const memory = memories[memoryIndex]
      if (!memory) throw new Error('memory not found: ' + memoryIndex)
      const prev = memory.buffer.byteLength >> 16
      try {
        memory.grow(delta)
        return prev
      } catch (e) {
        if (e instanceof RangeError) return -1
      }
    },
}
// (memory.copy (i32.add $string 8) (local.get $start) (local.get $size))
instructions['memory.copy'] = {
  immediateParams: [u32],
  params: [i32, i32, i32],
  func:
    (memoryIndex) =>
    ({ memories }, dest, src, byteSize) => {
      const memory = memories[memoryIndex]
      if (!memory) throw new Error('memory not found: ' + memoryIndex)
      const ui8 = new Uint8Array(memory.buffer)
      const srcSub = ui8.subarray(src, src + byteSize)
      ui8.set(srcSub, dest)
      return unit
    },
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
instructions['memory.init'] = {
  immediateParams: [u32, u32],
  params: [i32, i32, i32],
  func: (memoryIndex, segmentIndex) => {
    if (memoryIndex < 0 || !isSigned32BitInteger(memoryIndex)) throw new Error('invalid memory index')
    if (segmentIndex < 0 || !isSigned32BitInteger(segmentIndex)) throw new Error('invalid segment index')
    return ({ memories, segments }, dest, offset, nOfBytes) => {
      const memory = memories[memoryIndex]
      if (!memory) throw new Error('memory not found: ' + memoryIndex)
      const segment = segments[segmentIndex]
      if (!segment) throw new Error('segment not found: ' + segmentIndex)
      if (dest < 0 || !isSigned32BitInteger(dest)) throw new Error('invalid destination address')
      if (offset < 0 || !isSigned32BitInteger(offset)) throw new Error('invalid offset')
      if (nOfBytes < 0 || !isSigned32BitInteger(nOfBytes)) throw new Error('invalid number of bytes')
      if (dest + nOfBytes > memory.buffer.byteLength) throw new Error('destination address out of bounds')
      const segmentSub = segment.subarray(offset, offset + nOfBytes)
      const ui8 = new Uint8Array(memory.buffer)
      ui8.set(segmentSub, dest)
      return unit
    }
  },
}
// instructions['data.passive']
Object.freeze(instructions)
export { instructions }
