import { makeHost } from './host-simulated-mem.js'
import { jsHost } from './host-js.js'
import { makeInitContext } from './interpreter.js'

const host = jsHost
// const host = makeHost()

const { parseEvalFiles, parseStringToForms, evalLogForms } = makeInitContext(host)
const commandLineArgs = process.argv.slice(2)
const endsWithDashFlag = commandLineArgs.at(-1) === '-'
const files = endsWithDashFlag ? commandLineArgs.slice(0, -1) : commandLineArgs

parseEvalFiles(files)

import { startRepl } from './repl-util.js'

if (!endsWithDashFlag) {
  startRepl('history.json', 'wuns> ', (line) => {
    try {
      evalLogForms(parseStringToForms(line))
    } catch (err) {
      console.error(err)
    }
  })
}
