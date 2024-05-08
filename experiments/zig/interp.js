const fs = require('fs')
const source = fs.readFileSync('./interpreter.wasm')

let input = ''
let readChars = 0
const memory = new WebAssembly.Memory({ initial: 35, maximum: 100 })

const encoder = new TextEncoder()
const importObj = {
  env: {
    memory,
    fill: (p, l) => {
      console.log('fill', { p, l, input })
      const buffer = new Uint8Array(memory.buffer, p, l)
      const { written, read } = encoder.encodeInto(input.slice(readChars), buffer)
      readChars += read
      console.log(`read: ${read}, written: ${written}`)
      return written
    },
  },
}
WebAssembly.instantiate(source, importObj).then((result) => {
  const { parseEvalOne } = result.instance.exports
  input = '234 678'
  {
    const evalResult = parseEvalOne()
    console.log({ evalResult })
  }
  {
    const evalResult = parseEvalOne()
    console.log({ evalResult })
  }
})
