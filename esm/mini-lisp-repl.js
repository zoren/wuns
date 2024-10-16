import { makeDefEnv, print, readString } from './core.js'
import { evaluateForms, evaluateFile, catchErrors } from './mini-lisp.js'

const specialForms = [
  'i32',
  'word',
  'quote',
  'func',
  'macro',
  'fexpr',
  'extern',
  'def',
  'if',
  'do',
  'let',
  // not actually a special form
  '..',
]

const defEnv = makeDefEnv(process.cwd())

const getCompletions = (prefix) => {
  const completions = []
  for (const special of specialForms) if (special.startsWith(prefix)) completions.push(special)
  for (const key of defEnv.keys()) if (key.startsWith(prefix)) completions.push(key)
  return completions
}

const commandLineArgs = process.argv.slice(2)
const endsWithDashFlag = commandLineArgs.at(-1) === '-'
const files = endsWithDashFlag ? commandLineArgs.slice(0, -1) : commandLineArgs

catchErrors(() => {
  for (const filePath of files) evaluateFile(defEnv, filePath)
})
import { startRepl } from './repl-util.js'

if (!endsWithDashFlag) {
  let replLineNo = 0
  const evalLine = (line) =>
    console.log(print(catchErrors(() => evaluateForms(defEnv, readString(line, `repl-${replLineNo++}`)))))
  const regexEndWord = /[-./0-9a-z]+$/
  const completer = (line) => {
    const m = line.match(regexEndWord)
    if (!m) return [[], '']
    const currentWord = m[0]
    const defs = getCompletions(currentWord)
    return [defs, currentWord]
  }
  const lastWunsFile = files.at(-1) || 'top'
  startRepl(`repl-histories/${lastWunsFile}-history.json`, 'mini-lisp> ', evalLine, completer)
}
