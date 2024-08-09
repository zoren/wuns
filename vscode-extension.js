const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, SelectionRange, Range, Position, Diagnostic, DiagnosticSeverity } =
  vscode

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
 * @returns {{tree: TSParser.Tree, forms: []}} tree
 */
let parseDocumentTreeSitter = null

/**
 *
 * @param {vscode.TextDocument} document
 * @returns
 */
const cacheFetchOrParse = (document) => {
  const { version } = document
  const cacheObj = cache.get(document)
  if (!cacheObj) {
    const { tree, forms } = parseDocumentTreeSitter(document)
    const obj = { version, tree, forms }
    cache.set(document, obj)
    return obj
  }
  if (cacheObj.version === version) {
    // console.log('cache hit', document.uri, document.version)
    return cacheObj
  }
  // we don't expect to come here, onDidChangeTextDocument should have been called updating the tree
  console.error('cache miss', document.uri, document.version, cacheObj.version)
  const oldTree = cacheObj.tree
  const { tree, forms } = parseDocumentTreeSitter(document, oldTree)
  cacheObj.tree = tree
  cacheObj.forms = forms
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
  const { tree, forms } = parseDocumentTreeSitter(document, oldTree)
  // console.log('parse incremental took', watch(), 'ms')
  cacheObj.tree = tree
  cacheObj.forms = forms
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
const typeTokenType = tokenTypesMap.get('type')

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
      case 'recur':
        pushToken(head, keywordTokenType)
        for (const arg of tail) go(arg)
        break
      case 'defn':
      case 'defmacro': {
        pushToken(head, keywordTokenType)
        const [fmName, parameters, ...body] = tail
        if (fmName) {
          funcEnv.set(fmName.text, { headText, isMacro: headText === 'defmacro' })
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
      case 'def': {
        pushToken(head, keywordTokenType)
        if (tail.length === 0) break
        const cname = tail[0]
        if (cname.type === 'word') pushToken(cname, variableTokenType, declarationModifier)
        for (let i = 2; i < node.namedChildCount; i++) go(node.namedChildren[i])
        break
      }
      case 'external': {
        pushToken(head, keywordTokenType)
        // todo update this
        if (tail.length === 0) break
        const cname = tail[0]
        if (cname.type === 'word') pushToken(cname, functionTokenType, declarationModifier)
        if (tail.length === 1) break
        const params = tail[1]
        if (params.type === 'list')
          for (const param of params.namedChildren) pushToken(param, typeTokenType, declarationModifier)
        if (tail.length === 2) break
        const results = tail[2]
        if (results.type === 'list')
          for (const result of results.namedChildren) pushToken(result, typeTokenType, declarationModifier)
        // for (let i = 2; i < node.namedChildCount; i++) go(node.namedChildren[i])
        break
      }
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
 * @param {vscode.TextDocument} document
 */
const provideDocumentSemanticTokens = (document) => {
  const { tree } = cacheFetchOrParse(document)
  const { tokensBuilder, build } = tokenBuilderForParseTree()
  tree.rootNode.children.forEach(build)
  const semtoks = tokensBuilder.build()

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

const makeInterpretCurrentFile = async (context) => {
  const outputChannel = window.createOutputChannel('wuns output', wunsLanguageId)
  // outputChannel.show(true)
  const appendShow = (s) => {
    outputChannel.appendLine(s)
    outputChannel.show(true)
  }
  const { meta, print } = await import('./esm/core.js')
  const { makeContext } = await import('./esm/interpreter.js')
  const wunsDir = context.extensionPath + '/wuns/'
  return () => {
    const importObject = {
      check: {
        'report-error': (msg, form) => {
          console.log('report-error', print(msg), print(meta(form)))
        },
      },
    }
    const ctx = makeContext({ wunsDir, contextName: 'interpret', importObject })
    const { evalLogForms } = ctx

    const document = getActiveTextEditorDocument()
    const { forms } = cacheFetchOrParse(document)
    outputChannel.clear()
    appendShow('interpreting: ' + document.fileName)
    try {
      evalLogForms(forms, document.fileName)
      appendShow('done interpreting')
    } catch (e) {
      appendShow(e.message)
    }
  }
}

const makeCheckCurrentFileCommand = async (context) => {
  const outputChannel = window.createOutputChannel('wuns check', wunsLanguageId)
  const diag = languages.createDiagnosticCollection('wuns')
  const { meta, print } = await import('./esm/core.js')
  const { makeInitInterpreter, parseEvalFile } = await import('./esm/interpreter.js')
  const appendShow = (s) => {
    outputChannel.appendLine(s)
    outputChannel.show(true)
  }
  const wunsDir = context.extensionPath + '/wuns/'
  return async () => {
    const context = makeInitInterpreter()
    for (const name of ['std3', 'wasm-instructions', 'check']) parseEvalFile(context, wunsDir + name + '.wuns')
    const document = getActiveTextEditorDocument()
    if (!document) return
    const { forms } = cacheFetchOrParse(document)
    outputChannel.clear()
    appendShow('checking: ' + document.fileName)
    const { getVarVal } = context
    const checkTopForms = getVarVal('check-top-forms')
    const diagnostics = []
    try {
      const { errors } = checkTopForms(forms)
      for (const { message, form } of errors) {
        if (!Array.isArray(message)) throw new Error('msg is not an array')
        const metaData = meta(form)
        if (!metaData) throw new Error('meta is ' + metaData)
        const { range } = metaData
        if (!Array.isArray(range)) {
          console.error('range is not an array ' + print(form) + ' ' + print(metaData))
          return
        }
        const [startLine, startCol, endLine, endCol] = range
        const diagnostic = new Diagnostic(
          new Range(startLine, startCol, endLine, endCol),
          message.map(print).join(' '),
          DiagnosticSeverity.Error,
        )
        diagnostics.push(diagnostic)
      }
      appendShow('done checking: ' + forms.length)
    } catch (e) {
      appendShow(e.message)
      console.error('error evaluating checker', e)
    }
    diag.set(document.uri, diagnostics)
  }
}

/**
 *
 * @param {vscode.TextDocument} document
 * @param {vscode.Position[]} positions
 * @param {vscode.CancellationToken} token
 */
const provideSelectionRanges = (document, positions) => {
  const { tree } = cacheFetchOrParse(document)
  const topLevelNodes = tree.rootNode.children
  // todo make selection aware of special forms such as let, where one wan't to select bindings before entire binding form
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
  const { meta, print, isWord } = await import('./esm/core.js')
  const go = (x) => {
    const m = meta(x)
    const { startIndex, endIndex } = m
    if (isWord(x)) return `{${startIndex} - ${endIndex}}` + String(x)
    if (Array.isArray(x)) return `[{${startIndex} - ${endIndex}} ${x.map(go).join(' ')}]`
    throw new Error('unexpected form: ' + print(x))
  }
  const { parse, treeToForms } = await import('./esm/parseTreeSitter.js')
  parseDocumentTreeSitter = (document, oldTree) => {
    const watch = makeStopWatch()
    const tree = parse(document.getText(), oldTree)
    console.log('parse treesitter took', watch(), 'ms')
    return { tree, forms: treeToForms(tree) }
  }
  console.log('starting wuns lang extension: ' + context.extensionPath)
  const interpretCurrentFile = await makeInterpretCurrentFile(context)
  context.subscriptions.push(commands.registerCommand('wunslang.interpret', interpretCurrentFile))
  context.subscriptions.push(commands.registerCommand('wunslang.check', await makeCheckCurrentFileCommand(context)))

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
