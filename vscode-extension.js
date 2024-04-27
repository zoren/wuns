const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, languages } = vscode

const tokenTypes = [
  'function',
  'macro',
  'variable',
  'parameter',
  'keyword',
  'method',
  'string',
  'number',
  'property',
  'operator',
]

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

const isWordCharCode = (cc) => {
  return (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 46 || cc === 61 || cc === 45
}

const specialForms = new Set(['quote', 'if', 'let', 'loop', 'cont', 'func', 'macro'])

const keywordTokenType = encodeTokenType('keyword')
const functionTokenType = encodeTokenType('function')
const macroTokenType = encodeTokenType('macro')
const variableTokenType = encodeTokenType('variable')
const stringTokenType = encodeTokenType('string')

const declarationTokenModifier = encodeTokenModifiers(['declaration'])
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
      switch (cc) {
        case 32:
        case 9:
          character++
          continue
        case 91:
        case 93:
          startCol = character
          tokenType = cc
          character++
          return
      }
      startCol = character
      if (!isWordCharCode(cc)) throw new Error(`illegal character code ${cc}`)
      character++
      while (character < lineText.length && isWordCharCode(lineText.charCodeAt(character))) character++
      tokenType = 97
      return
    }
    done = true
  }
  nextToken()
  const pushToken = (tokenType, tokenModifiers) => {
    tokensBuilder.push(line, startCol, character - startCol, tokenType, tokenModifiers)
  }
  const stack = []
  const go = () => {
    if (done) return
    if (tokenType !== 91) {
      pushToken(variableTokenType)
      nextToken()
      return
    }
    nextToken()
    let listIndex = 0
    while (true) {
      if (done) {
        stack.length = 0
        return
      }
      if (tokenType === 93) {
        stack.pop()
        break
      }
      if (tokenType === 97) {
        if (stack.findIndex((frame) => frame === 'quote') !== -1) pushToken(stringTokenType)
        if (listIndex === 0) {
          const text = lineText.slice(startCol, character)
          stack.push(text)
          if (specialForms.has(text)) {
            pushToken(keywordTokenType)
          } else {
            pushToken(functionTokenType)
          }
        } else if (listIndex === 1) {
          if (stack.length > 0) {
            const stackTop = stack.at(-1)
            if (stackTop === 'macro') pushToken(macroTokenType, declarationTokenModifier)
            else if (stackTop === 'func') pushToken(functionTokenType, declarationTokenModifier)
            else if (stackTop === 'quote') pushToken(stringTokenType)
            else pushToken(variableTokenType)
          } else pushToken(variableTokenType)
        } else {
          if (stack.length > 1) {
            const stackTop = stack.at(-1)
            if (stackTop === 'macro') pushToken(macroTokenType)
            else if (stackTop === 'func') pushToken(functionTokenType)
            else pushToken(variableTokenType)
          } else pushToken(variableTokenType)
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
