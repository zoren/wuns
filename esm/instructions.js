import { setJSFunctionName } from './utils.js'

const instructionFunctions = []

const i32Instructions = [
  { name: 'add', op: '+' },
  { name: 'sub', op: '-', alias: 'subtract' },
  { name: 'mul', op: '*', alias: 'multiply' },
  { name: 'div-s', op: '/', alias: 'divide-signed' },
  { name: 'rem-s', op: '%', alias: 'remainder-signed' },

  { name: 'eq', op: '===', alias: 'equals' },
  { name: 'ne', op: '!==', alias: 'not-equals' },

  { name: 'lt-s', op: '<', alias: 'less-than-signed' },
  { name: 'le-s', op: '<=', alias: 'less-than-or-equal-signed' },
  { name: 'gt-s', op: '>', alias: 'greater-than-signed' },
  { name: 'ge-s', op: '>=', alias: 'greater-than-or-equal-signed' },

  { name: 'and', op: '&', alias: 'bitwise-and' },
  { name: 'or', op: '|', alias: 'bitwise-ior' },
  { name: 'xor', op: '^', alias: 'bitwise-xor' },
  { name: 'shl', op: '<<', alias: 'bitwise-shift-left' },
  { name: 'shr-s', op: '>>', alias: 'bitwise-shift-right' },
  { name: 'shr-u', op: '>>>', alias: 'bitwise-shift-right-unsigned' },
]
for (const { op, name } of i32Instructions) {
  const f = Function('a', 'b', `return (a ${op} b) | 0`)
  setJSFunctionName(f, `i32.${name}`)
  Object.freeze(f)
  instructionFunctions.push(f)
}

const unreachable = () => {
  throw new Error('unreachable')
}
Object.freeze(unreachable)
instructionFunctions.push(unreachable)
Object.freeze(instructionFunctions)

export { instructionFunctions }
