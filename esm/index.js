import fs from 'node:fs'
import path from 'node:path'
import * as readline from 'node:readline'
import { stdin, stdout, nextTick } from 'node:process'

import externs from './runtime-lib/externs.js'
import { makeDefEnv, print, readString, readFile, langUndefined } from './core.js'
import { makeEvalForm, catchErrors } from './interpreter.js'

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
  // todo add a whole bunch
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

const evalForm = makeEvalForm(externs, defEnv)
const evaluateForms = (forms) => {
  let result = langUndefined
  for (const form of forms) result = evalForm(form)
  return result
}
catchErrors(() => {
  for (const filePath of files) evaluateForms(readFile(filePath))
})

const readHistory = (historyFilePath) => {
  try {
    const histO = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'))
    return histO.history
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    return []
  }
}

if (!endsWithDashFlag) {
  let replLineNo = 0
  const evalLine = (line) =>
    console.log(print(catchErrors(() => evaluateForms(readString(line, `repl-${replLineNo++}`)))))
  const regexEndWord = /[-./0-9a-z]+$/
  const completer = (line) => {
    const m = line.match(regexEndWord)
    if (!m) return [[], '']
    const currentWord = m[0]
    const defs = getCompletions(currentWord)
    return [defs, currentWord]
  }
  const lastWunsFile = files.at(-1) || 'top'
  const historyFilePath = `repl-histories/${lastWunsFile}-history.json`
  const historyDir = path.dirname(historyFilePath)
  if (!fs.existsSync(historyDir)) throw new Error(`history directory does not exist: ${historyDir}`)
  const history = readHistory(historyFilePath)

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: true,
    historySize: 1024,
    history,
    removeHistoryDuplicates: true,
    tabSize: 2,
    completer,
  })

  rl.on('history', (history) => {
    const historyObject = { history, date: new Date().toISOString() }
    fs.writeFileSync(historyFilePath, JSON.stringify(historyObject, null, 2))
  })

  const prompt = () => {
    rl.question('wuns> ', (line) => {
      if (line === '') {
        console.log(`Bye!`)
        rl.close()
        return
      }
      evalLine(line)
      nextTick(prompt)
    })
  }

  prompt()
}
