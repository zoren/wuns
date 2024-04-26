const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, Position, Range, languages } = vscode

const tokenTypes = ['function', 'method', 'macro', 'variable', 'parameter', 'keyword', 'number', 'property', 'operator']
const tokenModifiers = ['declaration', 'definition', 'defaultLibrary', 'static', 'local']
const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers)

const assert = (cond, msg) => {
  if (!cond) throw new Error('assert failed: ' + msg)
}

const isWhitespace = (c) => c === ' ' || c === '\n'
const isWordChar = (c) => /[a-z0-9.=]|-/.test(c)

/**
 * @param {vscode.TextDocument} document
 */
const lexerFromDocument = (document) => {
  let position = new Position(0, 0)
  return () => {
    while (position.line < document.lineCount) {
      const lineText = document.lineAt(position.line).text
      if (position.character >= lineText.length) {
        position = new Position(position.line + 1, 0)
        continue
      }
      const tokStart = position
      const c = lineText[position.character]
      if (isWhitespace(c)) {
        position = new Position(position.line, position.character + 1)
        continue
      }
      if (c === '[' || c === ']') {
        const oldPos = position
        position = new Position(position.line, position.character + 1)
        return { tokenType: c, range: new Range(oldPos, position) }
      }
      assert(isWordChar(c), `illegal character ${c}`)
      while (position.character < lineText.length && isWordChar(lineText[position.character]))
        position = new Position(position.line, position.character + 1)
      const range = new Range(tokStart, position)
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
        if (listIndex === 0 && specialForms.has(text)) {
          tokensBuilder.push(range, 'keyword')
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
