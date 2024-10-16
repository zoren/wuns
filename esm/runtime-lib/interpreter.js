import {
  emptyList,
  isDefEnv,
  isForm,
  langUndefined,
  makeDefEnv,
  makeList,
  makeOptionSome,
  optionNone,
  tryGetFormList,
  tryGetFormWord,
  isClosure,
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
  if (!defValue || !isClosure(defValue) || defValue.kind !== 'macro') {
    console.log('expected macro', defValue)
    return form
  }
  return defValue(...list.slice(1))
}

export const try_get_macro = (context, name) => {
  if (!isDefEnv(context)) throw new Error('try-get-macro expects context')
  if (typeof name !== 'string') throw new Error('try-get-macro expects string')
  const value = context.get(name)
  if (isClosure(value) && value.kind === 'macro') return makeOptionSome(value)
  return optionNone
}

// todo get rid of this
export const evaluate_list_num = (context, fname, args) => {
  if (!isDefEnv(context)) throw new Error('evaluate expects context')
  if (typeof fname !== 'string') throw new Error('evaluate expects string')
  if (!Array.isArray(args)) throw new Error('evaluate expects array')
  args.forEach((arg) => {
    if (typeof arg !== 'number') throw new Error('expected number')
  })
  try {
    const func = context.get(fname)
    const res = func(...args)
    if (res === langUndefined) return emptyList
    if (typeof res === 'number') return makeList(res)
    if (Array.isArray(res)) {
      for (const r of res) if (typeof r !== 'number') throw new Error('expected number')
      return res
    }
    throw new Error('expected number or list of numbers')
  } catch (e) {
    console.error('evaluate-list-num', e)
  }
  return emptyList
}

export const apply = (func, args) => {
  if (!isClosure(func)) throw new Error('apply expects closure')
  if (!Array.isArray(args)) throw new Error('apply expects array')
  return func(...args)
}
