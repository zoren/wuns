import fs from 'node:fs'
import * as readline from 'node:readline'
import { stdin, stdout, nextTick } from 'node:process'

const readHistory = (historyFilePath) => {
  try {
    const histO = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'))
    return histO.history
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    return []
  }
}

export const startRepl = (historyFilePath, promptString, evalLine, completer) => {
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
    fs.writeFileSync(historyFilePath, JSON.stringify(historyObject))
  })

  const prompt = () => {
    rl.question(promptString, (line) => {
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
