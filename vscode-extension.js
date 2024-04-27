const parseDocument = (document) => {
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
      const c = lineText[character]
      switch (c) {
        case ' ':
          character++
          continue
        case '[':
        case ']':
          startCol = character
          tokenType = c
          character++
          return
      }
      startCol = character
      if (!isWordCharCode(c.charCodeAt(0))) throw new Error(`illegal character code ${c}`)
      character++
      while (character < lineText.length && isWordCharCode(lineText.charCodeAt(character))) character++
      tokenType = 'word'
      return
    }
    tokenType = ''
    done = true
  }
  nextToken()
  const go = () => {
    while (tokenType === ']') nextToken()
    if (tokenType === 'word') {
      const wordToken = { line, character: startCol, text: lineText.slice(startCol, character) }
      nextToken()
      return wordToken
    }
    if (tokenType !== '[') throw new Error('unexpected token type ' + tokenType)
    nextToken()
    const list = []
    list.startToken = { line, character }
    while (true) {
      if (done) return list
      if (tokenType === ']') {
        list.endToken = { line, character }
        nextToken()
        return list
      }
      list.push(go())
    }
  }
  const topLevelList = []
  while (!done) {
    topLevelList.push(go())
  }
  return topLevelList
}

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

const tokenModifiers = ['local', 'declaration', 'definition', 'defaultLibrary', 'static']

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
const parameterTokenType = encodeTokenType('parameter')
const stringTokenType = encodeTokenType('string')

const declarationTokenModifier = encodeTokenModifiers(['declaration'])
const localDeclarationTokenModifier = encodeTokenModifiers(['declaration', 'local'])

const tokenBuilderForParseTree = () => {
  const tokensBuilder = new SemanticTokensBuilder(legend)
  const pushToken = ({ line, character, text }, tokenType, tokenModifiers) => {
    if (text) tokensBuilder.push(line, character, text.length, tokenType, tokenModifiers)
  }
  const go = (node) => {
    const { text } = node
    if (text) {
      pushToken(node, variableTokenType)
      return
    }
    if (Array.isArray(node)) {
      if (node.length === 0) return
      const [head, ...tail] = node
      const headText = head.text
      if (!headText) return
      switch (headText) {
        case 'quote': {
          pushToken(head, keywordTokenType)
          const goQ = (node) => {
            if (node.text) pushToken(node, stringTokenType)
            else {
              for (const child of node) goQ(child)
            }
          }
          if (tail.length >= 1) goQ(tail[0])
          break
        }
        case 'if':
          pushToken(head, keywordTokenType)
          for (const child of tail) go(child)
          break
        case 'let':
        case 'loop': {
          pushToken(head, keywordTokenType)
          const [bindings, ...body] = tail
          for (let i = 0; i < bindings.length - 1; i += 2) {
            pushToken(bindings[i], variableTokenType, localDeclarationTokenModifier)
            go(bindings[i + 1])
          }
          for (const child of body) go(child)
          break
        }
        case 'cont':
          pushToken(head, keywordTokenType)
          for (const child of tail) go(child)
          break
        case 'func':
        case 'macro': {
          pushToken(head, keywordTokenType)
          const [fmName, parameters, ...body] = tail
          pushToken(fmName, headText === 'func' ? functionTokenType : macroTokenType, declarationTokenModifier)
          for (const parameter of parameters) pushToken(parameter, parameterTokenType)
          for (const child of body) go(child)
          break
        }
        default:
          pushToken(head, functionTokenType)
          for (const child of tail) go(child)
          break
      }
    }
  }
  return { tokensBuilder, build: go }
}

let prevSemTokens = null

/**
 * @param {vscode.TextDocument} document
 */
const provideDocumentSemanticTokens = (document, cancellingToken) => {
  const before = performance.now()
  // if (prevSemTokens !== null && prevSemTokens.version === document.version) return prevSemTokens
  const topLevelList = parseDocument(document)
  const { tokensBuilder, build } = tokenBuilderForParseTree()
  for (const node of topLevelList) {
    build(node)
  }
  // const tokensBuilder = makeAllTokensBuilder(document)
  prevSemTokens = tokensBuilder.build('1')
  prevSemTokens.version = document.version
  const after = performance.now()
  const elapsed = after - before
  console.log('time taken', Math.round(elapsed * 1000) / 1000, 'ms', document.version)
  return prevSemTokens
}

// provideDocumentSemanticTokensEdits?(document: TextDocument, previousResultId: string, token: CancellationToken): ProviderResult<SemanticTokens | SemanticTokensEdits>;
// const provideDocumentSemanticTokensEdits = (document, previousResultId, cancellingToken) => {
//   if (prevSemTokens === null) return provideDocumentSemanticTokens(document, cancellingToken)
//   if (prevSemTokens.resultId !== previousResultId) return provideDocumentSemanticTokens(document, cancellingToken)
//   const { data } = prevSemTokens
//   const prevResult = Number(previousResultId)
//   console.log({ prevResult, documentVersion: document.version })
//   const tokensBuilder = makeAllTokensBuilder(document)
//   return (prevSemTokens = tokensBuilder.build(String(prevResult + 1)))
// }

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
    // provideDocumentSemanticTokensEdits,
  }

  const selector = { language: 'wuns', scheme: 'file' }
  languages.registerOnTypeFormattingEditProvider
  context.subscriptions.push(languages.registerDocumentSemanticTokensProvider(selector, provider, legend))
  console.log('Congratulations, your extension "wunslang" is now active!')
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
