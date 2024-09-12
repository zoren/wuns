import { wordValue, stringToWord } from './core.js'
import { wrapJSFunctionsToObject } from './utils.js'

export const jsHost = {
  host: wrapJSFunctionsToObject(Object.values(await import('./host.js'))),
  converters: { wordValue, stringToWord },
}
