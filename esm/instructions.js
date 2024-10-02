import { setJSFunctionName } from './utils.js'

const instructionFunctions = []

const pushNamedFunc = (fname, ...args) => {
  const f = Function(...args)
  setJSFunctionName(f, fname)
  instructionFunctions.push(Object.freeze(f))
}

const i32Instructions = [
  { name: 'add', op: '+' },
  { name: 'sub', op: '-', alias: 'subtract' },
  { name: 'mul', op: '*', alias: 'multiply' },
  { name: 'div-s', op: '/', alias: 'divide-signed' },
  { name: 'rem-s', op: '%', alias: 'remainder-signed' },

  { name: 'eq', op: '===', alias: 'equals' },
  { name: 'ne', op: '!==', alias: 'not-equals' },

  { name: 'lt-s', op: '<', alias: 'less-than-signed' },
  { name: 'gt-s', op: '>', alias: 'greater-than-signed' },
  { name: 'le-s', op: '<=', alias: 'less-than-or-equal-signed' },
  { name: 'ge-s', op: '>=', alias: 'greater-than-or-equal-signed' },

  { name: 'and', op: '&', alias: 'bitwise-and' },
  { name: 'or', op: '|', alias: 'bitwise-ior' },
  { name: 'xor', op: '^', alias: 'bitwise-xor' },
  { name: 'shl', op: '<<', alias: 'bitwise-shift-left' },
  { name: 'shr-s', op: '>>', alias: 'bitwise-shift-right' },
  { name: 'shr-u', op: '>>>', alias: 'bitwise-shift-right-unsigned' },
]
for (const { op, name } of i32Instructions) {
  pushNamedFunc(`i32.${name}`, 'a', 'b', `return (a ${op} b) | 0`)
}

const f64ArithInstructions = [
  { name: 'add', op: '+' },
  { name: 'sub', op: '-' },
  { name: 'mul', op: '*' },
  { name: 'div', op: '/' },
]
for (const { op, name } of f64ArithInstructions) {
  pushNamedFunc(`f64.${name}`, 'a', 'b', `return (a ${op} b)`)
}

const f64CmpInstructions = [
  { name: 'eq', op: '===' },
  { name: 'ne', op: '!==' },

  { name: 'lt', op: '<' },
  { name: 'gt', op: '>' },
  { name: 'le', op: '<=' },
  { name: 'ge', op: '>=' },
]
for (const { op, name } of f64CmpInstructions) {
  pushNamedFunc(`f64.${name}`, 'a', 'b', `return (a ${op} b) | 0`)
}

const unreachable = () => {
  throw new Error('unreachable')
}
Object.freeze(unreachable)
instructionFunctions.push(unreachable)
Object.freeze(instructionFunctions)

export { instructionFunctions }
