const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, SelectionRange, Range, Position } = vscode

const TSParser = require('tree-sitter')
const parser = new TSParser()

const Wuns = require('tree-sitter-wuns')
parser.setLanguage(Wuns)

const positionToPoint = ({ line, character }) => ({ row: line, column: character })

const makeStopWatch = () => {
  const before = performance.now()
  return () => {
    const elapsed = performance.now() - before
    return Math.round(elapsed * 1000) / 1000
  }
}

const cache = new Map()

/**
 * @param {vscode.TextDocument} document
 * @param {TSParser.Tree} oldTree
 * @returns
 */
const parseDocument = (document, oldTree) => parser.parse(document.getText(), oldTree)

/**
 *
 * @param {vscode.TextDocument} document
 * @returns
 */
const cacheFetchOrParse = (document) => {
  const { version } = document
  const cacheObj = cache.get(document)
  if (!cacheObj) {
    const watch = makeStopWatch()
    const tree = parseDocument(document)
    console.log('parse initial took', watch(), 'ms')
    const obj = { version, tree }
    cache.set(document, obj)
    return obj
  }
  if (cacheObj.version === version) {
    // console.log('cache hit', document.uri, document.version)
    return cacheObj
  }
  // we don't expect to come here, onDidChangeTextDocument should have been called updating the tree
  const oldTree = cacheObj.tree
  // const watch = makeStopWatch()
  const newTree = parseDocument(document, oldTree)
  // console.log('parse time taken', watch(), 'ms', document.version)
  cacheObj.tree = newTree
  cacheObj.version = version
  return cacheObj
}

const wunsLanguageId = 'wuns'

/**
 * @param {vscode.TextDocumentChangeEvent} document
 */
const onDidChangeTextDocument = (e) => {
  const { document, contentChanges, reason } = e
  const { languageId, uri, version } = document
  if (languageId !== wunsLanguageId) return
  if (contentChanges.length === 0) return
  const cacheObj = cache.get(document)
  const oldTree = cacheObj.tree
  for (const { range, rangeLength, rangeOffset, text } of contentChanges) {
    // from https://github.com/microsoft/vscode-anycode/blob/main/anycode/server/src/common/trees.ts#L109
    const tsEdit = {
      startIndex: rangeOffset,
      oldEndIndex: rangeOffset + rangeLength,
      newEndIndex: rangeOffset + text.length,
      startPosition: positionToPoint(range.start),
      oldEndPosition: positionToPoint(range.end),
      newEndPosition: positionToPoint(document.positionAt(rangeOffset + text.length)),
    }
    oldTree.edit(tsEdit)
  }
  // console.log('tree edited', { version: document.version, nOfChanges: contentChanges.length })
  // const watch = makeStopWatch()
  const newTree = parseDocument(document, oldTree)
  // console.log('parse incremental took', watch(), 'ms')
  cacheObj.tree = newTree
  cacheObj.version = version
}

const tokenTypes = ['variable', 'keyword', 'function', 'macro', 'parameter', 'string']

const tokenModifiers = ['local', 'declaration', 'definition', 'defaultLibrary', 'static']

const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers)

const tokenTypesMap = new Map(tokenTypes.map((type, index) => [type, index]))

const tokenModifiersMap = new Map(tokenModifiers.map((mod, index) => [mod, index]))

const variableTokenType = tokenTypesMap.get('variable')
const keywordTokenType = tokenTypesMap.get('keyword')
const functionTokenType = tokenTypesMap.get('function')
const macroTokenType = tokenTypesMap.get('macro')
const parameterTokenType = tokenTypesMap.get('parameter')
const stringTokenType = tokenTypesMap.get('string')

// from https://github.com/microsoft/vscode-extension-samples/blob/main/semantic-tokens-sample/src/extension.ts#L54
const encodeTokenModifiers = (...strTokenModifiers) => {
  let result = 0
  for (const tokenModifier of strTokenModifiers)
    if (tokenModifiersMap.has(tokenModifier)) result = result | (1 << tokenModifiersMap.get(tokenModifier))
  return result
}

const declarationModifier = encodeTokenModifiers('declaration')
const localDeclarationTokenModifier = encodeTokenModifiers('local', 'declaration')

const tokenBuilderForParseTree = () => {
  const tokensBuilder = new SemanticTokensBuilder(legend)
  const pushToken = ({ startPosition, endPosition }, tokenType, tokenModifiers) => {
    tokensBuilder.push(
      startPosition.row,
      startPosition.column,
      endPosition.column - startPosition.column,
      tokenType,
      tokenModifiers,
    )
  }
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const go = (node) => {
    const { type, namedChildCount } = node
    if (type === 'word') {
      pushToken(node, variableTokenType)
      return
    }
    if (namedChildCount === 0) return
    const [head, ...tail] = node.namedChildren
    if (head.type !== 'word') return
    const headText = head.text
    switch (headText) {
      case 'quote': {
        pushToken(head, keywordTokenType)
        const goQ = (node) => {
          if (node.type === 'word') pushToken(node, stringTokenType)
          else node.namedChildren.forEach(goQ)
        }
        for (const child of tail) goQ(child)
        break
      }
      case 'if':
        pushToken(head, keywordTokenType)
        for (const child of tail) go(child)
        break
      case 'let':
      case 'loop': {
        pushToken(head, keywordTokenType)
        const [bindingsNode, ...body] = tail
        const bindings = bindingsNode.namedChildren
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
        pushToken(fmName, headText === 'func' ? functionTokenType : macroTokenType, declarationModifier)
        if (parameters.type === 'list') {
          let pi = 0
          const dotdotIndex = parameters.namedChildCount - 2
          for (const parameter of parameters.namedChildren) {
            if (pi++ === dotdotIndex && parameter.text === '..') {
              pushToken(parameter, keywordTokenType)
            } else pushToken(parameter, parameterTokenType, declarationModifier)
          }
        }
        for (const child of body) go(child)
        break
      }
      case 'constant':
        pushToken(head, keywordTokenType)
        for (const child of tail) go(child)
        break
      default:
        pushToken(head, functionTokenType)
        for (const arg of tail) go(arg)
        break
    }
  }
  return { tokensBuilder, build: go }
}

const { commands, window, languages, workspace } = vscode

/**
 * @returns {vscode.TextDocument}
 */
const getActiveTextEditorDocument = () => {
  const { activeTextEditor } = window
  if (!activeTextEditor) return null
  return activeTextEditor.document
}

const pointToPosition = ({ row, column }) => new Position(row, column)

const rangeFromNode = ({ startPosition, endPosition }) =>
  new Range(pointToPosition(startPosition), pointToPosition(endPosition))

const { evalTree } = require('./src/interpreter')

const makeInterpretCurrentFile = async (instructionsWasmUri) => {
  const uint8arInstructions = await workspace.fs.readFile(instructionsWasmUri)
  const wasm = await WebAssembly.instantiate(uint8arInstructions)
  const instructions = wasm.instance.exports
  const outputChannel = window.createOutputChannel('wuns output', wunsLanguageId)
  outputChannel.show(true)
  const importObject = {
    log: (s) => {
      outputChannel.show(true)
      outputChannel.appendLine(s)
    },
  }
  return () => {
    const document = getActiveTextEditorDocument()
    const { tree } = cacheFetchOrParse(document)
    outputChannel.clear()
    outputChannel.appendLine('interpreting: ' + document.fileName)
    {
      try {
        evalTree(tree, { importObject, instructions })
        outputChannel.appendLine('done interpreting: ' + forms.length + ' forms')
      } catch (e) {
        outputChannel.appendLine(e.message)
      }
    }
  }
}

// const crypto = require('crypto')

/**
 *
 * @param {vscode.TextDocument} document
 * @param {vscode.Position[]} positions
 * @param {vscode.CancellationToken} token
 */
const provideSelectionRanges = (document, positions) => {
  const { tree } = cacheFetchOrParse(document)
  const topLevelNodes = tree.rootNode.children
  const tryFindRange = (pos) => {
    const go = (node, parentSelectionRange) => {
      const range = rangeFromNode(node)
      if (!range.contains(pos)) return null
      if (node.type === 'word') return new SelectionRange(range, parentSelectionRange)
      const selRange = new SelectionRange(range, parentSelectionRange)
      for (const child of node.namedChildren) {
        const found = go(child, selRange)
        if (found) return found
      }
      return selRange
    }
    for (const node of topLevelNodes) {
      const found = go(node, undefined)
      if (found) return found
    }
    return null
  }
  const selRanges = []
  for (const pos of positions) {
    const found = tryFindRange(pos)
    if (found) selRanges.push(found)
  }
  return selRanges
}

/**
 * @param {vscode.TextDocument} document
 */
const provideDocumentSemanticTokens = (document) => {
  // const stopWatch = makeStopWatch()
  const { tree } = cacheFetchOrParse(document)
  const { tokensBuilder, build } = tokenBuilderForParseTree()
  tree.rootNode.children.forEach(build)
  const semtoks = tokensBuilder.build()
  // console.log('semantic tokens time taken', stopWatch(), 'ms', document.version)
  // const semtokHash = crypto.createHash('sha256').update(semtoks.data).digest('hex')
  // console.log({ semtoksCount: semtoks.data.length, semtokHash, file: document.fileName, version: document.version })

  return semtoks
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  console.log('starting wuns lang extension: ' + context.extensionPath)
  const instructionsWasmUri = vscode.Uri.file(context.extensionPath + '/src/instructions.wasm')
  const interpretCurrentFile = await makeInterpretCurrentFile(instructionsWasmUri)
  context.subscriptions.push(commands.registerCommand('wunslang.interpret', interpretCurrentFile))

  const selector = { language: 'wuns', scheme: 'file' }

  context.subscriptions.push(
    languages.registerDocumentSemanticTokensProvider(
      selector,
      {
        provideDocumentSemanticTokens,
      },
      legend,
    ),
    languages.registerSelectionRangeProvider(selector, { provideSelectionRanges }),
  )
  workspace.onDidChangeTextDocument(onDidChangeTextDocument)
  console.log('Congratulations, your extension "wunslang" is now active!')
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
