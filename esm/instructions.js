import { wordValue, isSigned32BitInteger } from './core.js'
const number = (f) => {
  if (isSigned32BitInteger(f)) return f
  const n = wordValue(f)
  if (isSigned32BitInteger(n)) return n
  throw new Error('expected 32-bit signed integer, found: ' + f)
}
const add = (a, b) => {
  const na = number(a)
  const nb = number(b)
  return (na + nb) | 0
}
const sub = (a, b) => {
  const na = number(a)
  const nb = number(b)
  return (na - nb) | 0
}

const bitwise_and = (a, b) => {
  const na = number(a)
  const nb = number(b)
  return (na & nb) | 0
}

const eq = (a, b) => {
  const na = number(a)
  const nb = number(b)
  return (na === nb) | 0
}
const eqz = (a) => {
  const na = number(a)
  return (na === 0) | 0
}
const lt = (a, b) => {
  const na = number(a)
  const nb = number(b)
  return (na < nb) | 0
}
const le = (a, b) => {
  const na = number(a)
  const nb = number(b)
  return (na <= nb) | 0
}
const gt = (a, b) => {
  const na = number(a)
  const nb = number(b)
  return (na > nb) | 0
}
const ge = (a, b) => {
  const na = number(a)
  const nb = number(b)
  return (na >= nb) | 0
}
const makeBinOp = (op) =>
  Function(
    'a',
    'b',
    `
const na = number(a)
const nb = number(b)
return (na ${op} nb) | 0`,
  )
export const i32 = {
  add,
  sub,
  'bitwise-and': bitwise_and,
  eq,
  eqz,
  lt,
  le,
  gt,
  ge,
}
