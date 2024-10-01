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
 * @returns {{tree: TSParser.Tree}} cache
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
    const { tree } = parseDocumentTreeSitter(document)
    const obj = { version, tree }
    cache.set(document, obj)
    return obj
  }
  if (cacheObj.version === version) return cacheObj

  // we don't expect to come here, onDidChangeTextDocument should have been called updating the tree
  console.error('cache miss', document.uri, document.version, cacheObj.version)
  const oldTree = cacheObj.tree
  const { tree } = parseDocumentTreeSitter(document, oldTree)
  cacheObj.tree = tree
  cacheObj.version = version
  return cacheObj
}

const wunsLanguageId = 'wuns'

/**
 * @param {vscode.TextDocumentChangeEvent} document
 */
const onDidChangeTextDocumentReparseChanges = (e) => {
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

  const { tree } = parseDocumentTreeSitter(document, oldTree)

  cacheObj.tree = tree
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
const tokenTypeNumber = tokenTypesMap.get('number')

// from https://github.com/microsoft/vscode-extension-samples/blob/main/semantic-tokens-sample/src/extension.ts#L54
const encodeTokenModifiers = (...strTokenModifiers) => {
  let result = 0
  for (const tokenModifier of strTokenModifiers)
    if (tokenModifiersMap.has(tokenModifier)) result = result | (1 << tokenModifiersMap.get(tokenModifier))
  return result
}

const declarationModifier = encodeTokenModifiers('declaration')
const modificationModifier = encodeTokenModifiers('modification')

const tokenBuilderForParseTree = (doc) => {
  const tokensBuilder = new SemanticTokensBuilder(legend)
  let prevRow = 0
  let prevColumn = 0
  const pushTokenWithModifier = ({ startPosition, endPosition }, tokenType, tokenModifiers) => {
    const { row, column } = startPosition
    if (row < prevRow || (row === prevRow && column < prevColumn))
      console.error(
        'sem toks out of order',
        { doc },
        { row: row + 1, column: column + 1 },
        { prevRow: prevRow + 1, prevCol: prevColumn + 1 },
      )

    prevRow = row
    prevColumn = column
    tokensBuilder.push(row, column, endPosition.column - column, tokenType, tokenModifiers)
  }
  const pushToken = (node, tokenType) => {
    pushTokenWithModifier(node, tokenType, 0)
  }

  const tagType = (f) => {
    if (f.type === 'word') pushToken(f, typeTokenType)
    else f.namedChildren.forEach(tagType)
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
    if (head.type !== 'word') return go(head)
    const headText = head.text
    switch (headText) {
      case 'i32':
        pushToken(head, keywordTokenType)
        if (tail.length) pushToken(tail[0], tokenTypeNumber)
        break
      case 'word':
        pushToken(head, keywordTokenType)
        if (tail.length) pushToken(tail[0], stringTokenType)
        break
      case 'quote':
        pushToken(head, keywordTokenType)
        for (const child of tail) {
          const goQ = (node) => {
            if (node.type === 'word') pushToken(node, stringTokenType)
            else node.namedChildren.forEach(goQ)
          }
          goQ(child)
        }
        break
      case 'if':
        pushToken(head, keywordTokenType)
        for (const child of tail) go(child)
        break
      case 'match':
        pushToken(head, keywordTokenType)
        for (const child of tail) go(child)
        break
      case 'do':
        pushToken(head, keywordTokenType)
        for (const child of tail) go(child)
        break
      case 'let': {
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
      case 'func':
      case 'fexpr':
      case 'macro': {
        pushToken(head, keywordTokenType)
        const [name, params, body] = tail
        if (name.type === 'word') pushToken(name, headText === 'macro' ? macroTokenType : functionTokenType)
        for (const param of params.namedChildren) {
          if (param.type === 'word') pushToken(param, parameterTokenType)
        }
        go(body)
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
      case 'extern':
        pushToken(head, keywordTokenType)
        for (const child of tail) if (child.type === 'word') pushToken(child, declarationModifier)
        break
      case 'atom':
        pushToken(head, keywordTokenType)
        if (tail.length) go(tail[0])
        break
      case 'load':
        pushToken(head, keywordTokenType)
        if (tail.length) pushToken(tail[0], stringTokenType)
        break
      case 'type-anno':
        pushToken(head, keywordTokenType)
        if (tail.length > 0) go(tail[0])
        if (tail.length > 1) tagType(tail[1])
        break
      case 'type': {
        pushToken(head, keywordTokenType)
        for (let i = 0; i < tail.length; i += 3) {
          pushToken(tail[i], typeTokenType)
          for (const typeParam of tail[i + 1].namedChildren) {
            if (typeParam.type === 'word') pushToken(typeParam, typeTokenType)
          }
          tagType(tail[i + 2])
        }
        break
      }
      default:
        pushToken(head, functionTokenType)
        for (const arg of tail) go(arg)
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
  const { tokensBuilder, build } = tokenBuilderForParseTree(document.fileName)
  tree.rootNode.children.forEach(build)
  const semtoks = tokensBuilder.build()

  return semtoks
}

const { languages, workspace } = vscode

const pointToPosition = ({ row, column }) => new Position(row, column)

const rangeFromNode = ({ startPosition, endPosition }) =>
  new Range(pointToPosition(startPosition), pointToPosition(endPosition))

/**
 *
 * @param {vscode.TextDocument} document
 * @param {vscode.Position[]} positions
 * @param {vscode.CancellationToken} token
 */
const provideSelectionRanges = (document, positions) => {
  const { tree } = cacheFetchOrParse(document)
  const topLevelNodes = tree.rootNode.children
  // todo make selection aware of special forms such as let, where one wants to select bindings(pairs) before entire binding form
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
  const { parse } = await import('./esm/parseTreeSitter.js')
  parseDocumentTreeSitter = (document, oldTree) => {
    const watch = makeStopWatch()
    const tree = parse(document.getText(), oldTree)
    console.log('parse treesitter took', watch(), 'ms')
    return { tree }
  }
  console.log('starting wuns lang extension: ' + context.extensionPath)

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
  workspace.onDidChangeTextDocument(onDidChangeTextDocumentReparseChanges)
  console.log('Congratulations, your extension "wunslang" is now active!')
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
