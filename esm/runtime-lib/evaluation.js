import { isForm, optionNone, makeOptionSome, resultError, resultOk } from '../core.js'
import { makeEvalForm } from '../interpreter.js'

const make_evaluator = () => {
  return makeEvalForm()
}

export { make_evaluator as 'make-evaluator' }

const evaluate_top = (evaluator, top_form) => {
  if (!isForm(top_form)) throw new Error('eval-top expects form')
  try {
    return resultOk(evaluator.evalTop(top_form))
  } catch (e) {
    return resultError(e)
  }
}

export { evaluate_top as 'evaluate-top' }

const evaluate_top_async = async (evaluator, top_form) => {
  if (!isForm(top_form)) throw new Error('eval-top-async expects form')
  return evaluator.evalTop(top_form)
}

export { evaluate_top_async as 'evaluate-top-async' }

const evaluate_exp = (evaluator, exp_form) => {
  if (!isForm(exp_form)) throw new Error('eval-exp expects form')
  try {
    return resultOk(evaluator.evalExp(exp_form))
  } catch (e) {
    return resultError(e)
  }
}

export { evaluate_exp as 'evaluate-exp' }

const try_get_macro = (evaluator, name) => {
  if (typeof name !== 'string') throw new Error('try-get-macro expects string')
  const value = evaluator.tryGetMacro(name)
  return value ? makeOptionSome(value) : optionNone
}

export { try_get_macro as 'try-get-macro' }
