import fs from 'node:fs/promises'
import * as readline from 'node:readline'
import { stdin, stdout, nextTick } from 'node:process'

import { parseString, print } from './core.js'
import { specialForms, makeJSCompilingEvaluator } from './compiler-js.js'
import { 'read-file-async' as read_file_async } from './runtime-lib/files.js'

Error.stackTraceLimit = Infinity;

const { evalTops, getDefNames } = makeJSCompilingEvaluator()

const getCompletions = (prefix) => {
  const completions = []
  for (const special of specialForms) if (special.startsWith(prefix)) completions.push(special)
  for (const key of getDefNames()) if (key.startsWith(prefix)) completions.push(key)
  return completions
}

const commandLineArgs = process.argv.slice(2)
const endsWithDashFlag = commandLineArgs.at(-1) === '-'
const files = endsWithDashFlag ? commandLineArgs.slice(0, -1) : commandLineArgs

const evaluateForms = async (forms) => {
  try {
    return await evalTops(forms)
  } catch (e) {
    console.error(e)
  }
}

for (const filePath of files) {
  const content = await read_file_async(filePath)
  await evaluateForms(parseString(content, filePath))
}

const readHistory = async (historyFilePath) => {
  try {
    const historyContent = await fs.readFile(historyFilePath, 'utf8')
    if (historyContent === '') return []
    const histO = JSON.parse(historyContent)
    return histO.history
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    return []
  }
}

if (!endsWithDashFlag) {
  let replLineNo = 0
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
  const history = await readHistory(historyFilePath)

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
    fs.writeFile(historyFilePath, JSON.stringify(historyObject, null, 2))
  })

  const prompt = () => {
    rl.question('wuns> ', async (line) => {
      if (line === '') {
        console.log(`Bye!`)
        rl.close()
        return
      }
      const forms = parseString(line, `repl-${replLineNo++}`)
      try {
        const result = await evaluateForms(forms)
        if (result !== null) console.log(print(result))
      } catch (e) {
        console.error(e)
      }
      nextTick(prompt)
    })
  }

  prompt()
}
