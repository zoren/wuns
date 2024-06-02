import fs from 'fs'
import { runRepl } from './repl.js'
import { setFile, parseEvalFile } from './interpreter.js'

const wunsDir = '../wuns/'
const wunsFiles = fs.readdirSync(wunsDir)

for (const file of wunsFiles) {
  if (!file.endsWith('.wuns')) continue
  const bla = wunsDir + file
  const content = fs.readFileSync(bla, 'utf8')
  setFile(bla, content)
}

const commandLineArgs = process.argv.slice(2)

if (commandLineArgs.length === 1) parseEvalFile(commandLineArgs[0])

runRepl()
