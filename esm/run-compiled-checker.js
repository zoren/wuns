import { 'test-ok-files' as test_ok_files } from './generated/test-check.formatted.js'

const files = process.argv.slice(2)
// const files = endsWithDashFlag ? commandLineArgs.slice(0, -1) : commandLineArgs
if (files.length !== 1) {
  console.error('expected 1 argument')
  process.exit(1)
}

test_ok_files(files[0])
