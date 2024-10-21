import { isDefEnv, isForm, langUndefined, resultError, resultOk } from '../core.js'
import { makeEvalForm } from '../interpreter.js'

export const make_evaluator = (externs, def_env) => {
  if (!isDefEnv(def_env)) throw new Error('make-evaluator expects context')
  return makeEvalForm(externs, def_env)
}

// these externs are defined here to avoid a circular dependency
export const evaluate = (eval_form, form) => {
  if (!isForm(form)) throw new Error('evaluate-result expects form')
  try {
    eval_form(form)
  } catch (e) {
    console.error('evaluate error discarded')
    console.log(form)
    console.error(e)
  }
  return langUndefined
}

export const evaluate_result = (eval_form, form) => {
  if (!isForm(form)) throw new Error('evaluate-result expects form')
  try {
    return resultOk(eval_form(form))
  } catch (e) {
    return resultError(e)
  }
}
