// import { do_two_things, do_two_things_2, do_two_things_3 } from './output.js'
// console.log(do_two_things())
// console.log(do_two_things_2())
// console.log(do_two_things_3())
import fs from 'node:fs'
import path from 'node:path'
const __dirname = path.dirname(new URL(import.meta.url).pathname)
const wasmModule = new WebAssembly.Module(fs.readFileSync(path.resolve(__dirname, 'output.wasm')))
const wasmInstance = new WebAssembly.Instance(wasmModule)
const { exports } = wasmInstance
for (const [key, f] of Object.entries(exports)) {
  for (let offset = -1; offset < 3; offset++) {
    const args = Array.from(new Array(f.length), (_, i) => i + offset)
    console.log(`${key}(${args.map(String).join(', ')}) = ${f(...args)}`)
  }
  console.log()
}
