import { langUndefined } from '../core.js'

import factory from '../../c/i2.js'

const { cwrap } = await factory()

let cParseEval = cwrap('parse_eval', 'number', ['string'])
let cParseEvalTopForms = cwrap('parse_eval_top_forms', 'number', ['string'])
let cGetType = cwrap('get_type', 'string', ['number'])
let cGetF64 = cwrap('get_f64', 'number', ['number'])
let cGetSize = cwrap('rt_get_size', 'number', ['number'])
let cGetList = cwrap('rt_get_list', 'number', ['number', 'number'])

const resultToString = (result) => {
  const type = cGetType(result)
  if (type === 'undefined') return langUndefined
  if (type === 'f64' || type === 'i32') return cGetF64(result)
  if (type === 'list') {
    const list = []
    for (let i = 0; i < cGetSize(result); i++) {
      list.push(resultToString(cGetList(result, i)))
    }
    return list
  }
  throw new Error(`Unknown type ${type}`)
}

export const parseEvalC = s => resultToString(cParseEval(s))

export const parseEvalTopFormsC = s => resultToString(cParseEvalTopForms(s))
