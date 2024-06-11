import fs from 'fs'
import path from 'path'
import { runRepl } from './repl.js'
import { makeContext } from './interpreter.js'

const wunsDir = '../wuns/'

const context = makeContext({ wunsDir, contextName: 'interpreter' })
const { parseEvalFile } = context

const commandLineArgs = process.argv.slice(2)

if (commandLineArgs.length === 1) parseEvalFile(path.basename(commandLineArgs[0]))

runRepl(context)
