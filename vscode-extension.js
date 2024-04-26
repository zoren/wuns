const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, Position, Range, languages } = vscode

const tokenTypes = ['function', 'method', 'macro', 'variable', 'parameter', 'keyword', 'number', 'property', 'operator']
const tokenModifiers = ['declaration', 'definition', 'defaultLibrary', 'static', 'local']
const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers)

const assert = (cond, msg) => {
  if (!cond) throw new Error('assert failed: ' + msg)
}

const isWhitespace = (c) => c === ' ' || c === '\n'
const isWordChar = (c) => {
  const cc = c.charCodeAt(0)
  return (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 46 || cc === 61 || cc === 45
}

/**
 * @param {vscode.TextDocument} document
 */
const lexerFromDocument = (document) => {
  let line = 0
  let character = 0
  return () => {
    while (line < document.lineCount) {
      const lineText = document.lineAt(line).text
      if (character >= lineText.length) {
        line++
        character = 0
        continue
      }
      const tokStart = new Position(line, character)
      const c = lineText[character]
      if (isWhitespace(c)) {
        character++
        continue
      }
      if (c === '[' || c === ']') {
        const before = new Position(line, character)
        const after = new Position(line, character + 1)
        character++
        return { tokenType: c, range: new Range(before, after) }
      }
      assert(isWordChar(c), `illegal character ${c}`)
      while (character < lineText.length && isWordChar(lineText[character])) character++
      const range = new Range(tokStart, new Position(line, character))
      return { tokenType: 'word', text: document.getText(range), range }
    }
    return null
  }
}

const specialForms = new Set(['quote', 'if', 'let', 'loop', 'cont', 'func', 'macro'])

/**
 * @param {vscode.TextDocument} document
 */
const provideDocumentSemanticTokens = (document) => {
  const tokensBuilder = new SemanticTokensBuilder(legend)

  const lexNext = lexerFromDocument(document)
  let token = lexNext()
  const nextToken = () => (token = lexNext())
  const go = () => {
    if (token === null) return
    {
      const peekTok = token
      nextToken()
      if (peekTok.tokenType !== '[') {
        tokensBuilder.push(peekTok.range, 'variable')
        return
      }
    }
    let listIndex = 0
    while (true) {
      if (token === null) return
      const { tokenType, range, text } = token
      if (tokenType === ']') break

      if (tokenType === 'word') {
        if (listIndex === 0) {
          if (specialForms.has(text)) tokensBuilder.push(range, 'keyword')
          else {
            // todo check in env if its a macro else assume function
            tokensBuilder.push(range, 'function')
          }
        } else {
          tokensBuilder.push(range, 'variable')
        }
      }
      go()
      listIndex++
    }
    nextToken()
  }
  while (token !== null) {
    go()
  }

  return tokensBuilder.build()
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('starting wuns lang extension')
  {
    const { commands, window } = vscode

    let disposable = commands.registerCommand('wunslang.helloWorld', function () {
      window.showInformationMessage('wuns [here] 007 [if [quote 32]]')
    })
    context.subscriptions.push(disposable)
  }

  const provider = {
    provideDocumentSemanticTokens,
  }

  const selector = { language: 'wuns', scheme: 'file' }

  context.subscriptions.push(languages.registerDocumentSemanticTokensProvider(selector, provider, legend))
  console.log('Congratulations, your extension "wunslang" is now active!')
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
