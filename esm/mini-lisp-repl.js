import { print } from './core.js'
import { makeDefEnv, readFile, evalForm, langUndefined, catchErrors, parseToForms } from './mini-lisp.js'

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

const defEnv = makeDefEnv()

const evaluateForms = (forms) => {
  let result = langUndefined
  for (const form of forms) result = evalForm(defEnv, form)
  return result
}

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
  for (const filePath of files) evaluateForms(readFile(filePath))
})
import { startRepl } from './repl-util.js'

if (!endsWithDashFlag) {
  let replLineNo = 0
  const evalLine = (line) =>
    console.log(print(catchErrors(() => evaluateForms(parseToForms(line, `repl-${replLineNo++}`)))))
  const completer = (line) => {
    const m = line.match(/[-./0-9a-z]+$/)
    if (!m) return [[], '']
    const currentWord = m[0]
    const defs = getCompletions(currentWord)
    return [defs, currentWord]
  }
  startRepl('mini-lisp-history.json', 'mini-lisp> ', evalLine, completer)
}
