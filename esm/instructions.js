const makeBinOp = (op) =>
  Function(
    'a',
    'b',
    `
if ((a | 0) !== a) throw new Error('expected 32-bit signed integer, found: ' + a)
if ((b | 0) !== b) throw new Error('expected 32-bit signed integer, found: ' + b)
return (a ${op} b) | 0`,
  )
const ops = {
  add: '+',
  sub: '-',
  mul: '*',
  eq: '===',
  lt: '<',
  le: '<=',
  gt: '>',
  ge: '>=',
  'bitwise-and': '&',
}
export const i32 = Object.fromEntries(Object.entries(ops).map(([name, op]) => [name, makeBinOp(op)]))
i32['eqz'] = (a) => {
  if ((a | 0) !== a) throw new Error('expected 32-bit signed integer, found: ' + a)
  return (a === 0) | 0
}
