import fs from 'fs'
import path from 'path'
import { runRepl } from './repl.js'
import { makeContext } from './interpreter.js'

const context = makeContext()
const { setFile } = context

const wunsDir = '../wuns/'
const wunsFiles = fs.readdirSync(wunsDir)

for (const file of wunsFiles) {
  if (!file.endsWith('.wuns')) continue
  const bla = wunsDir + file
  const content = fs.readFileSync(bla, 'utf8')
  setFile(file, content)
}

const commandLineArgs = process.argv.slice(2)

if (commandLineArgs.length === 1) parseEvalFile(path.basename(commandLineArgs[0]))

runRepl(context)
