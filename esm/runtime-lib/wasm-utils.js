import wabtProm from 'wabt'

const wabt = await wabtProm()

export const wat_to_byte_array = (inputBuffer) => {
  if (!(inputBuffer instanceof Uint8Array)) throw new Error('expects ArrayBuffer')
  const module = wabt.parseWat('', inputBuffer)
  module.resolveNames()
  module.validate()
  const { buffer } = module.toBinary({
    log: true,
    write_debug_names: true,
  })
  return buffer
}
export const byte_array_to_wasm_module = (buf) => new WebAssembly.Module(buf)
export const wasm_instantiate = (module, import_object) => new WebAssembly.Instance(module, import_object)
const emptyTuple = Object.freeze([])
export const wasm_call_export = (instance, export_name, args) => {
  if (!(instance instanceof WebAssembly.Instance)) throw new Error('expects instance')
  if (typeof export_name !== 'string') throw new Error('expects string')
  const { exports } = instance
  if (!(export_name in exports)) throw new Error('export not found: ' + export_name)
  const func = exports[export_name]
  if (typeof func !== 'function') throw new Error('export not a function: ' + export_name)
  if (!Array.isArray(args)) throw new Error('expects array')
  if (args.length !== func.length) throw new Error('parameter count mismatch')
  for (const arg of args) if (typeof arg !== 'number') throw new Error('expects number arguments')
  const res = func(...args)
  if (res === undefined) return emptyTuple
  if (!Array.isArray(res)) return Object.freeze([res])
  return Object.freeze(res)
}

export const wasm_get_export = (instance, export_name) => {
  if (!(instance instanceof WebAssembly.Instance)) throw new Error('expects instance')
  if (typeof export_name !== 'string') throw new Error('expects string')
  const { exports } = instance
  if (!(export_name in exports)) throw new Error('export not found: ' + export_name)
  return exports[export_name]
}

export const wasm_get_export_object = (instance) => {
  if (!(instance instanceof WebAssembly.Instance)) throw new Error('expects instance')
  return instance.exports
}

export const wasm_list_export_names = (instance, export_name) => {
  if (!(instance instanceof WebAssembly.Instance)) throw new Error('expects instance')
  if (typeof export_name !== 'string') throw new Error('expects string')
  const { exports } = instance
  if (!(export_name in exports)) throw new Error('export not found: ' + export_name)
  return Object.freeze(Object.keys(exports))
}
