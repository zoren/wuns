export const memory = (initial_size, maximum_size, shared) =>
  new WebAssembly.Memory({ initial: initial_size, maximum: maximum_size, shared })
const byte_array_to_wasm_module = (buf) => new WebAssembly.Module(buf)
export { byte_array_to_wasm_module as 'byte-array-to-wasm-module' }
const wasm_instantiate = (module, import_object) => new WebAssembly.Instance(module, import_object)
export { wasm_instantiate as 'wasm-instantiate' }
const emptyTuple = Object.freeze([])
const wasm_call_export = (instance, export_name, args) => {
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
export { wasm_call_export as 'wasm-call-export' }

const wasm_get_export = (instance, export_name) => {
  if (!(instance instanceof WebAssembly.Instance)) throw new Error('expects instance')
  if (typeof export_name !== 'string') throw new Error('expects string')
  const { exports } = instance
  if (!(export_name in exports)) throw new Error('export not found: ' + export_name)
  return exports[export_name]
}
export { wasm_get_export as 'wasm-get-export' }

const wasm_get_export_object = (instance) => {
  if (!(instance instanceof WebAssembly.Instance)) throw new Error('expects instance')
  return instance.exports
}
export { wasm_get_export_object as 'wasm-get-export-object' }

const wasm_list_export_names = (instance, export_name) => {
  if (!(instance instanceof WebAssembly.Instance)) throw new Error('expects instance')
  if (typeof export_name !== 'string') throw new Error('expects string')
  const { exports } = instance
  if (!(export_name in exports)) throw new Error('export not found: ' + export_name)
  return Object.freeze(Object.keys(exports))
}
export { wasm_list_export_names as 'wasm-list-export-names' }