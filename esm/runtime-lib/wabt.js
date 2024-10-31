import wabtProm from 'wabt'
const wabt = await wabtProm()

const wat_to_byte_array = (inputBuffer) => {
  if (!(inputBuffer instanceof Uint8Array)) throw new Error('expects Uint8Array')
  const module = wabt.parseWat('', inputBuffer, {
    multi_memory: true,
  })
  module.resolveNames()
  // todo maybe do this for debug symbols?
  // module.generateNames()
  module.validate()
  const { buffer, log } = module.toBinary({
    // log: true,
    write_debug_names: true,
  })
  // console.log({ toBinaryLog: log })
  return buffer
}

export { wat_to_byte_array as 'wat-to-byte-array' }
