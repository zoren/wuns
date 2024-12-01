let isBrowser
let read_file
let read_file_async
let write_file_async
let read_file_memory
let open
let close
const wunsDir = '../../wuns/'
if (typeof window === 'undefined') {
  isBrowser = () => false
  const fsPromises = await import('node:fs/promises')
  const path = await import('node:path')
  const dirname = import.meta.dirname
  const getFullPath = (file_path) => path.join(dirname, wunsDir, file_path)
  read_file = (file_path) => fs.readFileSync(getFullPath(file_path), 'ascii')
  read_file_async = (file_path) => {
    return fsPromises.readFile(getFullPath(file_path), 'ascii')
  }
  write_file_async = (file_path, data) => {
    if (typeof file_path !== 'string') throw new Error('expects string file_path')
    if (typeof data !== 'string') throw new Error('expects string data')
    // const fullFilePath = path.join(dirname, wunsDir, file_path)
    return fsPromises.writeFile(file_path, data, 'ascii')
  }
  const fs = await import('node:fs')
  open = (file_path) => fs.openSync(getFullPath(file_path), 'r')
  close = (fd) => fs.closeSync(fd)
  read_file_memory = (fd, memory, start, length) => {
    const bytes = new Uint8Array(memory.buffer)
    return fs.readSync(fd, bytes, start, length)
  }
} else {
  isBrowser = () => true
  const moduleStrings = import.meta.glob('../../wuns/*.wuns', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  read_file = async (file_path) => {
    const file = wunsDir + file_path
    if (file in moduleStrings) return moduleStrings[file]
    throw new Error(`file not found: ${file}`)
  }
  read_file_async = async (file_path) => {
    const file = wunsDir + file_path
    if (file in moduleStrings) return moduleStrings[file]
    throw new Error(`file not found: ${file}`)
  }
  write_file_async = (file_path, data) => {
    if (typeof file_path !== 'string') throw new Error('expects string file_path')
    if (typeof data !== 'string') throw new Error('expects string data')
    return Promise.reject(new Error('write_file_async not for web'))
  }
  const fileDescriptors = new Map()
  let fileDescriptorIndex = 0
  open = (file_path) => {
    const file = wunsDir + file_path
    const data = moduleStrings[file]
    if (!data) throw new Error(`file not found: ${file}`)
    const fd = fileDescriptorIndex++
    fileDescriptors.set(fd, { index: 0, data })
    return fd
  }
  close = (fd) => {
    fileDescriptors.delete(fd)
  }
  const encoder = new TextEncoder()
  read_file_memory = (fd, memory, start, length) => {
    const file = fileDescriptors.get(fd)
    if (!file) throw new Error(`file descriptor not found: ${fd}`)
    const { index, data } = file
    const bytes = new Uint8Array(memory.buffer, start, length)
    const { read, written } = encoder.encodeInto(data.slice(index), bytes)
    file.index += read
    return written
  }
}

export {
  isBrowser,
  read_file_async as 'read-file-async',
  write_file_async as 'write-file-async',
  read_file_memory as 'read-file-memory',
  open,
  close,
}
