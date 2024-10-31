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

export const createNamedFunction = (name, jsParameterNames, wunsParameterNames, wunsRestParameter, body) => {
  const f = createParameterNamesWrapper(jsParameterNames)(body)
  setJSFunctionName(f, name)
  f.parameters = wunsParameterNames
  if (wunsRestParameter) f.restParam = wunsRestParameter
  return Object.freeze(f)
}

const underscoreToDash = (s) => s.replace(/_/g, '-')

export const wrapJSFunctionName = (dashedName, importFunc) => {
  const jsParameterNames = parseFunctionParameters(importFunc)
  let wunsParameterNames = null
  let wunsRestParam = null
  if (jsParameterNames.length && jsParameterNames.at(-1).startsWith('...')) {
    wunsParameterNames = jsParameterNames.slice(0, -1).map(underscoreToDash)
    wunsRestParam = underscoreToDash(jsParameterNames.at(-1).slice(3))
  } else {
    wunsParameterNames = jsParameterNames.map(underscoreToDash)
  }
  return createNamedFunction(
    dashedName,
    jsParameterNames,
    wunsParameterNames,
    wunsRestParam,
    importFunc,
  )
}

export const wrapJSFunction = (importFunc) => wrapJSFunctionName(underscoreToDash(importFunc.name), importFunc)

export const wrapJSFunctionsToObject = (funcs) => {
  const newObject = {}
  for (const importFunc of funcs) {
    const func = wrapJSFunction(importFunc)
    newObject[func.name] = func
  }
  return Object.freeze(newObject)
}
