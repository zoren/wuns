export const memory = (initial_size, maximum_size, shared) =>
  new WebAssembly.Memory({ initial: initial_size, maximum: maximum_size, shared })
const memory_buffer = (memory) => {
  if (!(memory instanceof WebAssembly.Memory)) throw new Error('expects memory')
  return memory.buffer
}
export { memory_buffer as 'memory-buffer' }
const byte_array_to_wasm_module = (buf) => {
  const mod = new WebAssembly.Module(buf)
  // console.log('byte-array-to-wasm-module', WebAssembly.Module.exports(mod))
  return mod
}
export { byte_array_to_wasm_module as 'byte-array-to-wasm-module' }
const wasm_instantiate = (module, import_object) => new WebAssembly.Instance(module, import_object)
export { wasm_instantiate as 'wasm-instantiate' }

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