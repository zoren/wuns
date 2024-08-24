const instructionFunctions = {}
const addI32InstructionFunc = (name, f) => {
  instructionFunctions['i32.' + name] = f
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

for (const [name, op] of Object.entries(i32binops))
  addI32InstructionFunc(name, Function('a', 'b', `return (a ${op} b) | 0`))

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

instructionFunctions['unreachable'] = Object.freeze(() => {
  throw new Error('unreachable')
})

Object.freeze(instructionFunctions)

export { instructionFunctions }
