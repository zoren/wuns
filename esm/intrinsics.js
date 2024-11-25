import { setJSFunctionName } from './utils.js'
const intrinsics = {}

const pushNamedFunc = (fname, exp) => {
  const f = Function(
    'a',
    'b',
    `
    if (typeof a !== 'number') throw new Error('${fname} first arg is not a number');
    if (typeof b !== 'number') throw new Error('${fname} second arg is not a number');
    return (${exp})`,
  )
  setJSFunctionName(f, fname)
  intrinsics[fname] = Object.freeze(f)
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
  pushNamedFunc(`i32.${name}`, `(a ${op} b) | 0`)
}

const f64ArithInstructions = [
  { name: 'add', op: '+' },
  { name: 'sub', op: '-' },
  { name: 'mul', op: '*' },
  { name: 'div', op: '/' },
]
for (const { op, name } of f64ArithInstructions) {
  pushNamedFunc(`f64.${name}`, `(a ${op} b)`)
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
  pushNamedFunc(`f64.${name}`, `(a ${op} b) | 0`)
}

const unreachable = () => {
  throw new Error('unreachable')
}
Object.freeze(unreachable)
intrinsics.unreachable = unreachable

Object.freeze(intrinsics)

export { intrinsics }

export const primtiveArrays = Object.freeze({
  i8: { arrayName: 'Int8Array', byteSize: 1 },
  u8: { arrayName: 'Uint8Array', byteSize: 1 },
  i16: { arrayName: 'Int16Array', byteSize: 2 },
  u16: { arrayName: 'Uint16Array', byteSize: 2 },
  i32: { arrayName: 'Int32Array', byteSize: 4 },
  // i64: { arrayName: 'BigInt64Array', byteSize: 8 },
  // u64: { arrayName: 'BigUint64Array', byteSize: 8 },
  f64: { arrayName: 'Float64Array', byteSize: 8 },
})

export const storeInstToType = {
  'i32.store8': 'i8',
  'i32.store16': 'i16',
  'i32.store': 'i32',
  'f64.store': 'f64',
}

export const loadInstToType = {
  'i32.load': 'i32',
  'i32.load8-u': 'u8',
  'i32.load8-s': 'i8',
  'i32.load16-u': 'u16',
  'i32.load16-s': 'i16',
  'f64.load': 'f64',
}
