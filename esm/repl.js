import fs from 'node:fs'
import * as readline from 'node:readline'
import { stdin, nextTick, stdout } from 'node:process'

const historyFilePath = 'history.json'

export const runRepl = ({ parseEvalString }) => {
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
    rl.question(`> `, (line) => {
      if (line === '') {
        console.log(`Bye!`)
        rl.close()
        return
      }
      parseEvalString(line)
      nextTick(prompt)
    })
  }
  return prompt()
}
