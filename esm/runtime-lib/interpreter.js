import {
  isDefEnv,
  isForm,
  makeDefEnv,
  makeOptionSome,
  optionNone,
  tryGetFormList,
  tryGetFormWord,
  tryGetClosureKind,
} from '../core.js'

export const make_context = (currentDir) => {
  if (typeof currentDir !== 'string') throw new Error('make-context expects string')
  return makeDefEnv(currentDir)
}

export const macro_expand = (context, form) => {
  if (!isDefEnv(context)) throw new Error('macro-expand expects context')
  if (!isForm(form)) throw new Error('macro-expand expects a form')
  const list = tryGetFormList(form)
  if (!list || list.length === 0) {
    console.log('expected non-empty list')
    return form
  }
  const firstWord = tryGetFormWord(list[0])
  if (!firstWord) {
    console.log('expected word first')
    return form
  }
  const defValue = context.get(firstWord)
  if (!defValue || tryGetClosureKind(defValue) !== 'macro') {
    console.log('expected macro', defValue)
    return form
  }
  return defValue(...list.slice(1))
}

export const try_get_macro = (context, name) => {
  if (!isDefEnv(context)) throw new Error('try-get-macro expects context')
  if (typeof name !== 'string') throw new Error('try-get-macro expects string')
  const value = context.get(name)
  if (tryGetClosureKind(value) === 'macro') return makeOptionSome(value)
  return optionNone
}

export const apply = (func, args) => {
  if (typeof func !== 'function') throw new Error('apply expects function')
  if (!Array.isArray(args)) throw new Error('apply expects array')
  return func(...args)
}
