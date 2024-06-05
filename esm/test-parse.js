import fs from 'node:fs'
const module = new WebAssembly.Module(fs.readFileSync('parse.wasm'))
const memory = new WebAssembly.Memory({ initial: 1})
const env = { memory }
const importObject = { env }
const instance = new WebAssembly.Instance(module, importObject)
const { exports } = instance
console.log(exports)
const bumpAllocInit = exports['bump-alloc-init']
const bumpAlloc = exports['bump-alloc']
const expectRuntimeError = (f) => {
  try {
    f()
  } catch (e) {
    if (e instanceof WebAssembly.RuntimeError) return
    throw e
  }
  throw new Error('expected runtime error')
}
expectRuntimeError(() => bumpAlloc(0))
expectRuntimeError(() => bumpAlloc(1))
expectRuntimeError(() => bumpAlloc(8))

bumpAllocInit()
expectRuntimeError(() => bumpAllocInit())
if (bumpAlloc(4) !== 16) throw new Error('expected 0')
if (bumpAlloc(4) !== 20) throw new Error('expected 1')
expectRuntimeError(() => bumpAlloc(128*1024))
expectRuntimeError(() => bumpAlloc(-1))
if (bumpAlloc(64*1024 - (20 + 4)) != 24) throw new Error('expected 2')
// we've used up all the memory
expectRuntimeError(() => bumpAlloc(4))
