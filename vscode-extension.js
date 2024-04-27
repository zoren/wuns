const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, languages } = vscode

const tokenTypes = ['function', 'macro', 'variable', 'parameter', 'keyword', 'method', 'number', 'property', 'operator']

const tokenTypesToIndexMap = new Map(tokenTypes.map((type, idx) => [type, idx]))

const encodeTokenType = (tokenType) => {
  if (tokenTypesToIndexMap.has(tokenType)) return tokenTypesToIndexMap.get(tokenType)
  if (tokenType === 'notInLegend') return tokenTypesToIndexMap.size + 2
  return 0
}

const tokenModifiers = ['declaration', 'definition', 'defaultLibrary', 'static', 'local']

const tokenModifiersToIndex = new Map(tokenModifiers.map((mod, idx) => [mod, idx]))

const encodeTokenModifiers = (strTokenModifiers = []) => {
  let result = 0
  for (let i = 0; i < strTokenModifiers.length; i++) {
    const tokenModifier = strTokenModifiers[i]
    if (tokenModifiersToIndex.has(tokenModifier)) {
      result = result | (1 << tokenModifiersToIndex.get(tokenModifier))
    } else if (tokenModifier === 'notInLegend') {
      result = result | (1 << (tokenModifiers.size + 2))
    }
  }
  return result
}
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
      const c = lineText[character]
      if (isWhitespace(c)) {
        character++
        continue
      }
      if (c === '[' || c === ']') {
        const startCol = character
        character++
        return { tokenType: c, line, character: startCol, length: 1 }
      }
      assert(isWordChar(c), `illegal character ${c}`)
      const tokStartCol = character
      while (character < lineText.length && isWordChar(lineText[character])) character++
      return {
        tokenType: 'word',
        text: lineText.slice(tokStartCol, character),
        line,
        character: tokStartCol,
        length: character - tokStartCol,
      }
    }
    return null
  }
}

const specialForms = new Set(['quote', 'if', 'let', 'loop', 'cont', 'func', 'macro'])

const makeAllTokensBuilder = (document) => {
  const tokensBuilder = new SemanticTokensBuilder(legend)
  const pushToken = (token, tokenType, tokenModifiers) => {
    const { line, character, length } = token
    tokensBuilder.push(line, character, length, encodeTokenType(tokenType))
  }

  const lexNext = lexerFromDocument(document)
  let token = lexNext()
  const nextToken = () => (token = lexNext())
  const go = () => {
    if (token === null) return
    {
      if (token.tokenType !== '[') {
        pushToken(token, 'variable')
        nextToken()
        return
      }
      nextToken()
    }
    let listIndex = 0
    while (true) {
      if (token === null) return
      const { tokenType } = token
      if (tokenType === ']') break

      if (tokenType === 'word') {
        const { text } = token
        if (listIndex === 0) {
          if (specialForms.has(text)) pushToken(token, 'keyword')
          else {
            // todo check in env if its a macro else assume function
            pushToken(token, 'function')
          }
        } else {
          pushToken(token, 'variable')
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

  return tokensBuilder
}

let prevSemTokens = null

/**
 * @param {vscode.TextDocument} document
 */
const provideDocumentSemanticTokens = (document, cancellingToken) => {
  const tokensBuilder = makeAllTokensBuilder(document)
  return (prevSemTokens = tokensBuilder.build('1'))
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
