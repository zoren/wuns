import { langUndefined } from '../core.js'

import cInterModule from '../../c/i2.js'

let cParseEval = cInterModule.cwrap('parse_eval', 'number', ['string'])
let cParseEvalTopForms = cInterModule.cwrap('parse_eval_top_forms', 'number', ['string'])
let cGetType = cInterModule.cwrap('get_type', 'string', ['number'])
let cGetF64 = cInterModule.cwrap('get_f64', 'number', ['number'])

const resultToString = (result) => {
  const type = cGetType(result)
  if (type === 'undefined') return langUndefined
  if (type === 'f64' || type === 'i32') return cGetF64(result)
  throw new Error(`Unknown type ${type}`)
}

export const parseEvalC = s => resultToString(cParseEval(s))

export const parseEvalTopFormsC = s => resultToString(cParseEvalTopForms(s))
