let isBrowser
let read_file_async
let write_file_async
const wunsDir = '../../wuns/'
if (typeof window === 'undefined') {
  isBrowser = () => false
  const fsPromises = await import('node:fs/promises')
  const path = await import('node:path')
  const dirname = import.meta.dirname
  read_file_async = (file_path) => {
    const fullFilePath = path.join(dirname, wunsDir, file_path)
    return fsPromises.readFile(fullFilePath, 'ascii')
  }
  write_file_async = (file_path, data) => {
    if (typeof file_path !== 'string') throw new Error('expects string file_path')
    if (typeof data !== 'string') throw new Error('expects string data')
    // const fullFilePath = path.join(dirname, wunsDir, file_path)
    return fsPromises.writeFile(file_path, data, 'ascii')
  }
} else {
  isBrowser = () => true
  const moduleStrings = import.meta.glob('../../wuns/*.wuns', {
    query: '?raw',
    import: 'default',
  })
  read_file_async = async (file_path) => {
    const file = wunsDir + file_path
    const f = moduleStrings[file]
    if (!f) throw new Error(`file not found: ${file}`)
    return f()
  }
  write_file_async = (file_path, data) => {
    if (typeof file_path !== 'string') throw new Error('expects string file_path')
    if (typeof data !== 'string') throw new Error('expects string data')
    return Promise.reject(new Error('write_file_async not for web'))
  }
}

export { isBrowser, read_file_async as 'read-file-async', write_file_async as 'write-file-async' }
