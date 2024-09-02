// https://stackoverflow.com/a/69745650/3495920
export const isPlainObject = (value) => value?.constructor === Object

export const setJSFunctionName = (f, value) => {
  Object.defineProperty(f, 'name', { value })
}
// https://stackoverflow.com/a/9924463/3495920
// const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/gm
const STRIP_COMMENTS_DEFAULT_ARGS =
  /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*=[^,\)]*(('(?:\\'|[^'\r\n])*')|("(?:\\"|[^"\r\n])*"))|(\s*=[^,\)]*))/gm
const ARGUMENT_NAMES = /([^\s,]+)/g

export const parseFunctionParameters = (func) => {
  const fnStr = func.toString().replace(STRIP_COMMENTS_DEFAULT_ARGS, '')
  return fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES) || []
}

export const createParameterNamesWrapper = (parameters) => {
  const paramsString = parameters.join(', ')
  return Function('body', `return function (${paramsString}) { return body(${paramsString}) }`)
}

export const isJSReservedWord = (word) => {
  return [
    'abstract',
    'await',
    'boolean',
    'break',
    'byte',
    'case',
    'catch',
    'char',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'double',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'final',
    'finally',
    'float',
    'for',
    'function',
    'goto',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'int',
    'interface',
    'let',
    'long',
    'native',
    'new',
    'null',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'short',
    'static',
    'super',
    'switch',
    'synchronized',
    'this',
    'throw',
    'throws',
    'transient',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'volatile',
    'while',
    'with',
    'yield',
  ].includes(word)
}
