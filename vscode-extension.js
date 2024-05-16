const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, SelectionRange, Range, Position, Diagnostic, DiagnosticSeverity } =
  vscode

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
    const newEndIndex = rangeOffset + text.length
    const tsEdit = {
      startIndex: rangeOffset,
      oldEndIndex: rangeOffset + rangeLength,
      newEndIndex,
      startPosition: positionToPoint(range.start),
      oldEndPosition: positionToPoint(range.end),
      newEndPosition: positionToPoint(document.positionAt(newEndIndex)),
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
// https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide
const tokenTypes = ['variable', 'keyword', 'function', 'macro', 'parameter', 'string', 'number', 'comment', 'type']

const tokenModifiers = ['declaration', 'definition', 'readonly', 'defaultLibrary', 'modification']
// https://github.com/microsoft/vscode/blob/70e10d604e1939e9d98f3970f6f19604bfe2852c/src/vs/workbench/api/common/extHostTypes.ts#L3379
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
const modificationModifier = encodeTokenModifiers('modification')

const tokenBuilderForParseTree = () => {
  const tokensBuilder = new SemanticTokensBuilder(legend)
  let prevRow = 0
  let prevColumn = 0
  const pushTokenWithModifier = ({ startPosition, endPosition }, tokenType, tokenModifiers) => {
    const { row, column } = startPosition
    if (row < prevRow || (row === prevRow && column < prevColumn))
      console.error('sem toks out of order', { row, column }, { prevRow, prevCol: prevColumn })

    prevRow = row
    prevColumn = column
    tokensBuilder.push(row, column, endPosition.column - column, tokenType, tokenModifiers)
  }
  const pushToken = (node, tokenType) => {
    pushTokenWithModifier(node, tokenType, 0)
  }
  const funcEnv = new Map()
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
        const bindings = bindingsNode ? bindingsNode.namedChildren : []
        for (let i = 0; i < bindings.length - 1; i += 2) {
          pushTokenWithModifier(bindings[i], variableTokenType, declarationModifier)
          go(bindings[i + 1])
        }
        for (const child of body) go(child)
        break
      }
      case 'continue':
        pushToken(head, keywordTokenType)
        for (let i = 1; i < namedChildCount - 1; i += 2) {
          pushTokenWithModifier(node.namedChild(i), variableTokenType, modificationModifier)
          go(node.namedChild(i + 1))
        }
        break
      case 'func':
      case 'macro': {
        pushToken(head, keywordTokenType)
        const [fmName, parameters, ...body] = tail
        if (fmName) {
          funcEnv.set(fmName.text, { headText, isMacro: headText === 'macro' })
          pushTokenWithModifier(fmName, headText === 'func' ? functionTokenType : macroTokenType, declarationModifier)
        }
        if (parameters && parameters.type === 'list') {
          let pi = 0
          const dotdotIndex = parameters.namedChildCount - 2
          for (const parameter of parameters.namedChildren) {
            if (pi++ === dotdotIndex && parameter.text === '..') {
              pushToken(parameter, keywordTokenType)
            } else pushTokenWithModifier(parameter, parameterTokenType, declarationModifier)
          }
        }
        for (const child of body) go(child)
        break
      }
      case 'constant':
        pushToken(head, keywordTokenType)
        if (tail.length === 0) break
        const cname = tail[0]
        if (cname.type === 'word') pushToken(cname, variableTokenType, declarationModifier)
        for (let i = 2; i < node.namedChildCount; i++) go(node.namedChildren[i])
        break
      default:
        {
          const func = funcEnv.get(headText)
          pushToken(head, func && func.isMacro ? macroTokenType : functionTokenType)
          for (const arg of tail) go(arg)
        }
        break
    }
  }
  return { tokensBuilder, build: go }
}
/**
 * @param {TSParser.Tree} tree
 */
const semanticTokensCursor = (tree) => {
  const cursor = tree.walk()
  if (cursor.gotoFirstChild()) {
    while (cursor.gotoNextSibling()) {
      console.log('sem cursor node', cursor.nodeType, cursor.nodeTypeId)
    }
    cursor.gotoParent()
  }
}

/**
 * @param {vscode.TextDocument} document
 */
const provideDocumentSemanticTokens = (document) => {
  // const stopWatch = makeStopWatch()
  const { tree } = cacheFetchOrParse(document)
  // semanticTokensCursor(tree)
  const { tokensBuilder, build } = tokenBuilderForParseTree()
  tree.rootNode.children.forEach(build)
  const semtoks = tokensBuilder.build()
  // console.log('semantic tokens time taken', stopWatch(), 'ms', document.version)
  // const semtokHash = crypto.createHash('sha256').update(semtoks.data).digest('hex')
  // console.log({ semtoksCount: semtoks.data.length, semtokHash, file: document.fileName, version: document.version })

  return semtoks
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

const { meta, print, mkFuncEnv } = require('./src/std')
const { evalTree, treeToOurForm, makeEvaluator } = require('./src/interpreter')

const reportError = (msg, form) => {
  console.log('report-error', print(msg), print(meta(form)))
}

const makeInterpretCurrentFile = async (instructions) => {
  const outputChannel = window.createOutputChannel('wuns output', wunsLanguageId)
  outputChannel.show(true)
  const importObject = {
    log: (s) => {
      outputChannel.show(true)
      outputChannel.appendLine(s)
    },
    'report-error': reportError,
  }
  return () => {
    const document = getActiveTextEditorDocument()
    const { tree } = cacheFetchOrParse(document)
    outputChannel.clear()
    outputChannel.appendLine('interpreting: ' + document.fileName)
    {
      try {
        const funcEnv = mkFuncEnv(importObject, instructions)
        evalTree(tree, funcEnv)
        outputChannel.appendLine('done interpreting')
      } catch (e) {
        outputChannel.appendLine(e.message)
      }
    }
  }
}

const makeCheckCurrentFileCommand = async (instructions, context) => {
  const checkUri = vscode.Uri.file(context.extensionPath + '/wuns/check.wuns')
  const outputChannel = window.createOutputChannel('wuns check', wunsLanguageId)
  outputChannel.show(true)
  const diag = languages.createDiagnosticCollection('wuns')

  return async () => {
    const uint8 = await workspace.fs.readFile(checkUri)
    const checkSource = new TextDecoder().decode(uint8)
    const diagnostics = []
    const importObject = {
      log: (s) => {
        outputChannel.show(true)
        outputChannel.appendLine('check: ' + s)
      },
      'report-error': (msg, form) => {
        if (!Array.isArray(msg)) throw new Error('msg is not an array')
        const metaData = meta(form)
        if (!metaData) throw new Error('meta is ' + metaData)
        const [_, range] = metaData
        if (!Array.isArray(range)) {
          console.log('metaData', metaData)
          console.log('form', form)
          console.log('range', range)
          throw new Error('range is not an array ' + print(form) + ' ' + print(metaData))
        }
        const diagnostic = new Diagnostic(
          new Range(...range.map((w) => Number(w.value))),
          msg.map(print).join(' '),
          DiagnosticSeverity.Error,
        )
        diagnostics.push(diagnostic)
      },
    }
    const { gogoeval, apply, getExport } = makeEvaluator(importObject, instructions)

    const document = getActiveTextEditorDocument()
    if (!document) return
    const { tree } = cacheFetchOrParse(document)
    outputChannel.clear()
    outputChannel.appendLine('checking: ' + document.fileName)
    const checkTree = parser.parse(checkSource)
    for (const node of checkTree.rootNode.children) {
      const form = treeToOurForm(node)
      try {
        gogoeval(form)
      } catch (e) {
        console.error('error evaluating', print(form), e)
        throw e
      }
    }
    try {
      // const outfunEnv = evalTree(checkTree, { importObject, instructions })
      const outfun = getExport('check-forms')
      // for (const node of tree.rootNode.children) apply(outfun, [treeToOurForm(node)])
      apply(outfun, [tree.rootNode.children.map(treeToOurForm)])
      outputChannel.appendLine('done checking: ' + tree.rootNode.children.length)
    } catch (e) {
      outputChannel.appendLine(e.message)
      console.error('error evaluating checker', e)
    }
    diag.set(document.uri, diagnostics)
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
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  console.log('starting wuns lang extension: ' + context.extensionPath)
  const instructionsWasmUri = vscode.Uri.file(context.extensionPath + '/src/instructions.wasm')
  const uint8arInstructions = await workspace.fs.readFile(instructionsWasmUri)
  const wasm = await WebAssembly.instantiate(uint8arInstructions)
  const instructions = wasm.instance.exports
  const interpretCurrentFile = await makeInterpretCurrentFile(instructions)
  context.subscriptions.push(commands.registerCommand('wunslang.interpret', interpretCurrentFile))
  context.subscriptions.push(
    commands.registerCommand('wunslang.check', await makeCheckCurrentFileCommand(instructions, context)),
  )

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
