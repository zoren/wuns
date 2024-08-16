import fs from 'node:fs'
import * as readline from 'node:readline'
import { stdin, nextTick, stdout } from 'node:process'
import { parseStringToForms } from './parseTreeSitter.js'
import { evalLogForms } from './interpreter.js'
import { makeInterpreterContext, addHostFunctions, parseEvalFiles } from './interpreter.js'

const defVars = new Map()
addHostFunctions(defVars)
const compile = makeInterpreterContext(defVars)

const commandLineArgs = process.argv.slice(2)

parseEvalFiles(compile, commandLineArgs)

const historyFilePath = 'history.json'

let history = []
try {
  const histO = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'))
  history = histO.history
} catch (err) {
  if (err.code !== 'ENOENT') throw err
}

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
  terminal: true,
  historySize: 1024,
  history,
  removeHistoryDuplicates: true,
  tabSize: 2,
})

rl.on('history', (history) => {
  const historyObject = { history, date: new Date().toISOString() }
  fs.writeFileSync(historyFilePath, JSON.stringify(historyObject))
})

const prompt = () => {
  rl.question(`wuns> `, (line) => {
    if (line === '') {
      console.log(`Bye!`)
      rl.close()
      return
    }
    try {
      evalLogForms(compile, parseStringToForms(line))
    } catch (err) {
      console.error(err)
    }
    nextTick(prompt)
  })
}

prompt()
