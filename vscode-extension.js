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

const isWordCharCode = (cc) => {
  return (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 46 || cc === 61 || cc === 45
}

const specialForms = new Set(['quote', 'if', 'let', 'loop', 'cont', 'func', 'macro'])

/**
 * @param {vscode.TextDocument} document
 */
const makeAllTokensBuilder = (document) => {
  const tokensBuilder = new SemanticTokensBuilder(legend)

  let line = 0
  let character = 0
  let startCol = 0
  let lineText = ''
  let tokenType = ''
  let done = false

  const nextToken = () => {
    while (line < document.lineCount) {
      lineText = document.lineAt(line).text
      if (character >= lineText.length) {
        line++
        character = 0
        continue
      }
      const cc = lineText.charCodeAt(character)
      if (cc === 32 || cc === 9) {
        character++
        continue
      }
      startCol = character
      if (cc === 91 || cc === 93) {
        tokenType = lineText[character]
        character++
        return
      }
      if (!isWordCharCode(cc)) throw new Error(`illegal character code ${cc}`)
      character++
      while (character < lineText.length && isWordCharCode(lineText.charCodeAt(character))) character++
      tokenType = 'word'
      return
    }
    done = true
  }
  nextToken()
  const pushToken = (tokenType) => {
    tokensBuilder.push(line, startCol, character - startCol, encodeTokenType(tokenType))
  }
  const go = () => {
    if (done) return
    if (tokenType !== '[') {
      pushToken('variable')
      nextToken()
      return
    }
    nextToken()
    let listIndex = 0
    while (true) {
      if (done) return
      if (tokenType === ']') break
      if (tokenType === 'word') {
        if (listIndex === 0) {
          const text = lineText.slice(startCol, character)
          if (specialForms.has(text)) pushToken('keyword')
          else {
            // todo check in env if its a macro else assume function
            pushToken('function')
          }
        } else {
          pushToken('variable')
        }
      }
      go()
      listIndex++
    }
    nextToken()
  }
  while (!done) {
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
