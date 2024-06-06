import fs from 'node:fs'
const module = new WebAssembly.Module(fs.readFileSync('parse.wasm'))
const memory = new WebAssembly.Memory({ initial: 1 })
const env = { memory }
const importObject = { env }
const instance = new WebAssembly.Instance(module, importObject)
const { exports } = instance
console.log(exports)
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
expectRuntimeErrorUnreachable(() => bumpAlloc(0))
expectRuntimeErrorUnreachable(() => bumpAlloc(1))
expectRuntimeErrorUnreachable(() => bumpAlloc(8))

bumpAllocInit()
expectRuntimeErrorUnreachable(() => bumpAllocInit())
if (bumpAlloc(4) !== 16) throw new Error('expected 0')
if (bumpAlloc(4) !== 20) throw new Error('expected 1')
expectRuntimeErrorUnreachable(() => bumpAlloc(128 * 1024))
expectRuntimeErrorUnreachable(() => bumpAlloc(-1))
if (bumpAlloc(64 * 1024 - (20 + 4)) != 24) throw new Error('expected 2')
// we've used up all the memory
expectRuntimeErrorUnreachable(() => bumpAlloc(4))
