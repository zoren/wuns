const makeBinOp = (op) =>
  Function(
    'a',
    'b',
    `
if ((a | 0) !== a) throw new Error('op ${op} expected 32-bit signed integer, found: ' + a)
if ((b | 0) !== b) throw new Error('op ${op} expected 32-bit signed integer, found: ' + b)
return (a ${op} b) | 0`,
  )
export const i32binops = {
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

  'bitwise-and': '&',
  'bitwise-ior': '|',
  'bitwise-xor': '^',
  'bitwise-shift-left': '<<',
  'bitwise-shift-right': '>>',
  'bitwise-shift-right-unsigned': '>>>',
}
export const i32 = Object.fromEntries(Object.entries(i32binops).map(([name, op]) => [name, makeBinOp(op)]))
i32['eqz'] = (a) => {
  if ((a | 0) !== a) throw new Error('expected 32-bit signed integer, found: ' + a)
  return (a === 0) | 0
}
