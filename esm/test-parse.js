import fs from 'node:fs'
const module = new WebAssembly.Module(fs.readFileSync('parse.wasm'))

const memory = new WebAssembly.Memory({ initial: 1 })
const logSizePointer = (size, pointer) => {
  console.log('size', size, 'pointer', pointer)
  return undefined
}
const env = { memory, 'log-size-pointer': logSizePointer }
const importObject = { env }
const instance = new WebAssembly.Instance(module, importObject)
const { exports } = instance
const bumpAllocInit = exports['bump-alloc-init']
const bumpAlloc = exports['bump-alloc']
const expectRuntimeErrorUnreachable = (f) => {
  try {
    f()
  } catch (e) {
    if (e instanceof WebAssembly.RuntimeError && e.message === 'unreachable') return
    throw e
  }
  throw new Error('expected runtime error')
}
const allocExpectPointer = (expected, n) => {
  const actual = bumpAlloc(n)
  if (actual !== expected) throw new Error(`expected ${expected} but got ${actual}`)
}
expectRuntimeErrorUnreachable(() => bumpAlloc(0))
expectRuntimeErrorUnreachable(() => bumpAlloc(1))
expectRuntimeErrorUnreachable(() => bumpAlloc(8))
bumpAllocInit()
expectRuntimeErrorUnreachable(() => bumpAllocInit())
allocExpectPointer(16, 4)
allocExpectPointer(20, 4)
expectRuntimeErrorUnreachable(() => bumpAlloc(128 * 1024))
expectRuntimeErrorUnreachable(() => bumpAlloc(-1))
allocExpectPointer(24, 64 * 1024 - (20 + 4))
// we've used up all the memory
expectRuntimeErrorUnreachable(() => bumpAlloc(4))
// const ui8 = new Uint8Array(memory.buffer)
// const hexDump = (moduleBytes) => {
//   for (let i = 0; i < 0x200; i += 16) {
//     console.log([...moduleBytes.slice(i, i + 16)].map((n) => n.toString(16).padStart(2, '0')).join(' '))
//   }
// }
// hexDump(ui8)
