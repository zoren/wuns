let builder = (maxByteLength = 1024 * 1024 * 1024 * 4) => {
  let abuf = new ArrayBuffer(1024, { maxByteLength })
  let curLen = 0
  let ensureAddedSize = (addedSize) => {
    let newSize = curLen + addedSize
    if (newSize > abuf.byteLength) abuf.resize(Math.max(abuf.byteLength * 2, newSize))
  }

  let ui8 = new Uint8Array(abuf)
  let pushByte = (b) => {
    ensureAddedSize(1)
    ui8[curLen++] = b
  }
  let i32 = new Int32Array(abuf)
  let pushI32 = (i) => {
    ensureAddedSize(4)
    i32[curLen / 4] = i
    curLen += 4
  }
  let pushULEB128 = (n) => {
    if (n < 0) throw new Error('n must be positive')
    if (!Number.isInteger(n)) throw new Error('n must be an integer')
    do {
      let byte = n & 127
      n >>= 7
      if (n !== 0) {
        byte |= 128
      }
      pushByte(byte)
    } while (n !== 0)
  }
  let pushBytes = (bytes) => {
    if (!(bytes instanceof Uint8Array)) throw new Error('bytes must be an instance of Uint8Array')
    ensureAddedSize(bytes.length)
    for (let byte of bytes) ui8[curLen++] = byte
  }
  let encoder = new TextEncoder()
  let pushString = (str) => {
    let strBytes = encoder.encode(str)
    ensureAddedSize(strBytes.length)
    for (let byte of strBytes) ui8[curLen++] = byte
  }
  let get = () => new Uint8Array(abuf, 0, curLen)
  let reset = () => (curLen = 0)
  return {
    pushByte,
    pushI32,
    pushULEB128,
    pushBytes,
    pushString,
    get,
    reset,
  }
}

let mb = builder()
// magic number
mb.pushByte(0)
mb.pushString('asm')
const wasmVersion = 1
mb.pushI32(wasmVersion)
// type section
let typeBuilder = builder()
let pushResultType = (types) => {
  typeBuilder.pushULEB128(types.length)
  types.forEach((t) => {
    typeBuilder.pushByte(t)
  })
}
let pushFuncType = (params, results) => {
  typeBuilder.pushByte(96)
  pushResultType(params)
  pushResultType(results)
}

mb.pushByte(1)
