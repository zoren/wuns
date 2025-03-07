import wabtProm from 'wabt'
const wabt = await wabtProm()

const wat_to_wasm_byte_array = (inputString) => {
  if (typeof inputString !== 'string') throw new Error('expects string')
  try {
    /**
     * @typedef {import('wabt')} PWabtModule
     * @typedef {ReturnType<PWabtModule>} WabtModuleP
     * @typedef {WabtModuleP extends Promise<infer X> ? X : never} WabtModule2
     * @typedef {Parameters<WabtModule2['parseWat']>} ParseWatParams
     * @typedef {NonNullable<ParseWatParams[2]>} ParseWatOptions
     * @type {ParseWatOptions}
     */
    const wasmFeatures = {
      multi_memory: true,
      memory64: true,
    }
    const module = wabt.parseWat('', inputString, wasmFeatures)
    module.resolveNames()
    // todo maybe do this for debug symbols?
    // module.generateNames()
    // warning the types for wabt does not reflect that validate also needs wasmFeatures
    // todo report this to wabt
    module.validate(wasmFeatures)
    // console.log(inputString)

    const { buffer, log } = module.toBinary({
      // log: true,
      write_debug_names: true,
    })
    // console.log({ toBinaryLog: log })
    return buffer
  } catch (e) {
    console.error(e)
    console.error(inputString)
    throw e
  }
}

export { wat_to_wasm_byte_array as 'wat-to-wasm-byte-array' }
