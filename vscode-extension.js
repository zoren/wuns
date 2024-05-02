const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, SelectionRange, Range, Position } = vscode

const TSParser = require('tree-sitter')
const parser = new TSParser()

const Wuns = require('tree-sitter-wuns')
parser.setLanguage(Wuns)

const pointToPosition = ({ row, column }) => new Position(row, column)

const positionToPoint = ({ line, character }) => ({ row: line, column: character })

const rangeFromNode = ({ startPosition, endPosition }) =>
  new Range(pointToPosition(startPosition), pointToPosition(endPosition))

/**
 *
 * @param {TSParser.SyntaxNode} node
 * @returns
 */
const treeToOurForm = (node) => {
  const { type, text, namedChildren } = node
  let form
  switch (type) {
    case 'word':
      form = { text }
      break
    case 'list': {
      form = namedChildren.map(treeToOurForm)
      break
    }
    default:
      throw new Error('unexpected node type: ' + type)
  }
  form.range = rangeFromNode(node)
  return form
}

const makeStopWatch = () => {
  const before = performance.now()
  return () => {
    const elapsed = performance.now() - before
    return Math.round(elapsed * 1000) / 1000
  }
}

const cache = new Map()

/**
 *
 * @param {vscode.TextDocument} document
 * @returns
 */
const cacheFetchOrParse = (document) => {
  const { version } = document
  const cacheObj = cache.get(document)
  if (!cacheObj) {
    const sourceCodeString = document.getText()
    const watch = makeStopWatch()
    const tree = parser.parse(sourceCodeString)
    console.log('parse initial took', watch(), 'ms')
    const obj = { version, tree }
    cache.set(document, obj)
    return obj
  }
  if (cacheObj.version === version) return cacheObj
  const sourceCodeString = document.getText()
  const oldTree = cacheObj.tree
  const watch = makeStopWatch()
  const newTree = parser.parse(sourceCodeString, oldTree)
  console.log('parse time taken', watch(), 'ms', document.version)
  cacheObj.tree = newTree
  cacheObj.version = version
  return cacheObj
}

/**
 * @param {vscode.TextDocumentChangeEvent} document
 */
const onDidChangeTextDocument = (e) => {
  const { document, contentChanges, reason } = e
  const { languageId, uri, version } = document
  if (languageId !== 'wuns') return
  if (contentChanges.length === 0) return
  const cacheObj = cache.get(document)
  const oldTree = cacheObj.tree
  for (const { range, rangeLength, rangeOffset, text } of contentChanges) {
    // from https://github.com/microsoft/vscode-anycode/blob/main/anycode/server/src/common/trees.ts#L109
    const tsEdit = {
      startPosition: positionToPoint(range.start),
      oldEndPosition: positionToPoint(range.end),
      newEndPosition: positionToPoint(document.positionAt(rangeOffset + text.length)),
      startIndex: rangeOffset,
      oldEndIndex: rangeOffset + rangeLength,
      newEndIndex: rangeOffset + text.length,
    }
    oldTree.edit(tsEdit)
  }
  console.log('tree edited', { version: document.version, nOfChanges: contentChanges.length })
  const watch = makeStopWatch()
  const newTree = parser.parse(document.getText(), oldTree)
  console.log('parse incremental took', watch(), 'ms')
  cacheObj.tree = newTree
  cacheObj.version = version
}

const tokenTypes = ['variable', 'keyword', 'function', 'macro', 'parameter', 'string', 'number']

const tokenModifiers = ['local', 'declaration', 'definition', 'defaultLibrary', 'static']

const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers)

const tokenBuilderForParseTree = () => {
  const tokensBuilder = new SemanticTokensBuilder(legend)
  const pushToken = (syntaxNode, tokenType, ...tokenModifiers) => {
    const range = rangeFromNode(syntaxNode)
    // console.log('push-token', { range, tokenType, tokenModifiers })
    tokensBuilder.push(range, tokenType, tokenModifiers)
  }
  /**
   * @param {TSParser.SyntaxNode} node
   */
  const go = (node) => {
    const { type, namedChildCount } = node
    if (type === 'word') {
      pushToken(node, 'variable')
      return
    }
    if (namedChildCount === 0) return
    const [head, ...tail] = node.namedChildren
    if (head.type !== 'word') return
    const headText = head.text
    switch (headText) {
      case 'quote': {
        pushToken(head, 'keyword')
        const goQ = (node) => {
          if (node.type === 'word') pushToken(node, 'string')
          else node.namedChildren.forEach(goQ)
        }
        if (tail.length >= 1) goQ(tail[0])
        break
      }
      case 'if':
        pushToken(head, 'keyword')
        for (const child of tail) go(child)
        break
      case 'let':
      case 'loop': {
        pushToken(head, 'keyword')
        const [bindings, ...body] = tail
        for (let i = 0; i < bindings.length - 1; i += 2) {
          pushToken(bindings[i], 'variable', 'declaration', 'local')
          go(bindings[i + 1])
        }
        for (const child of body) go(child)
        break
      }
      case 'cont':
        pushToken(head, 'keyword')
        for (const child of tail) go(child)
        break
      case 'func':
      case 'macro': {
        pushToken(head, 'keyword')
        const [fmName, parameters, ...body] = tail
        pushToken(fmName, headText === 'func' ? 'function' : 'macro', 'declaration')
        if (parameters.type === 'list') {
          let pi = 0
          const dotdotIndex = parameters.namedChildCount - 2
          for (const parameter of parameters.namedChildren) {
            if (pi++ === dotdotIndex && parameter.text === '..') {
              pushToken(parameter, 'keyword')
            } else pushToken(parameter, 'parameter', 'declaration')
          }
        }
        for (const child of body) go(child)
        break
      }
      case 'global':
        pushToken(head, 'keyword')
        for (const child of tail) go(child)
        break
      default:
        pushToken(head, 'function')
        for (const arg of tail) go(arg)
        break
    }
  }
  return { tokensBuilder, build: go }
}

const unit = Object.freeze([])
const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))

const symbolContinue = Symbol.for('wuns-continue')
const tryMap = (arr, f) => {
  if (arr) return arr.map(f)
  return unit
}
const makeEvaluator = (funcEnv) => {
  const globalVarValues = new Map()
  const globalEnv = { varValues: globalVarValues, outer: null }
  const apply = ({ params, restParam, bodies }, args) => {
    const varValues = new Map()
    for (let i = 0; i < params.length; i++) varValues.set(params[i], args[i])
    if (restParam) varValues.set(restParam, makeList(...args.slice(params.length)))
    const inner = { varValues, outer: globalEnv }
    let result = unit
    for (const body of bodies) result = wunsEval(body, inner)
    return result
  }
  const assert = (cond, msg) => {
    if (!cond) throw new Error('eval assert failed: ' + msg)
  }
  const wunsEval = (form, env) => {
    if (typeof form === 'string')
      while (true) {
        assert(env, 'undefined word: ' + form)
        const { varValues, outer } = env
        if (varValues.has(form)) return varValues.get(form)
        env = outer
      }

    assert(Array.isArray(form), `cannot eval ${form} expected string or array`)
    if (form.length === 0) return unit
    const [firstWord, ...args] = form
    switch (firstWord) {
      case 'quote':
        return args[0]
      case 'if':
        return wunsEval(args[wunsEval(args[0], env) === '0' ? 2 : 1], env)
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const varValues = new Map()
        const inner = { varValues, outer: env }
        for (let i = 0; i < bindings.length - 1; i += 2) varValues.set(bindings[i], wunsEval(bindings[i + 1], inner))
        let result = unit
        if (firstWord === 'let') {
          for (const body of bodies) result = wunsEval(body, inner)
          return result
        }
        while (true) {
          for (const body of bodies) result = wunsEval(body, inner)
          if (!result[symbolContinue]) return result
          for (let i = 0; i < Math.min(result.length, varValues.size); i++) varValues.set(bindings[i * 2], result[i])
        }
      }
      case 'cont': {
        const contArgs = args.map((a) => wunsEval(a, env))
        contArgs[symbolContinue] = true
        return Object.freeze(contArgs)
      }
      case 'func':
      case 'macro': {
        const [fname, origParams0, ...bodies] = args
        const origParams = origParams0 || unit
        let params = origParams
        let restParam = null
        if (origParams.at(-2) === '..') {
          params = origParams.slice(0, -2)
          restParam = origParams.at(-1)
        }
        const fObj = { isMacro: firstWord === 'macro', params, restParam, bodies }
        funcEnv.set(fname, fObj)
        return unit
      }
      case 'global': {
        const [varName, value] = args
        globalVarValues.set(varName, wunsEval(value, env))
        return unit
      }
    }
    const funcOrMacro = funcEnv.get(firstWord)
    assert(funcOrMacro, `function ${firstWord} not found ${print(form)}`)
    if (typeof funcOrMacro === 'function') return funcOrMacro(...args.map((arg) => wunsEval(arg, env)))
    assert(typeof funcOrMacro === 'object', `expected function or object ${funcOrMacro}`)
    const { isMacro } = funcOrMacro
    if (isMacro) return wunsEval(apply(funcOrMacro, args), env)
    return apply(
      funcOrMacro,
      args.map((arg) => wunsEval(arg, env)),
    )
  }
  const gogomacro = (form) => {
    if (typeof form === 'string') return form
    assert(Array.isArray(form), `cannot expand ${form} expected string or array`)
    if (form.length === 0) return unit
    const [firstWord, ...args] = form
    switch (firstWord) {
      case 'quote':
        return form
      case 'if':
        return makeList(firstWord, ...tryMap(args, gogomacro))
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        return makeList(
          firstWord,
          tryMap(bindings, (borf, i) => (i % 2 === 0 ? borf : gogomacro(borf))),
          ...bodies.map(gogomacro),
        )
      }
      case 'cont':
        return makeList(firstWord, ...args.map(gogomacro))
      case 'func':
      case 'macro': {
        const [fname, origParams, ...bodies] = args
        return makeList(firstWord, fname, origParams, ...bodies.map(gogomacro))
      }
      case 'global': {
        const [varName, value] = args
        return makeList(firstWord, varName, gogomacro(value))
      }
    }
    const funcOrMacro = funcEnv.get(firstWord)
    if (funcOrMacro && funcOrMacro.isMacro) return gogomacro(apply(funcOrMacro, args.map(gogomacro)))
    return makeList(firstWord, ...args.map(gogomacro))
  }
  return {
    gogoeval: (form) => wunsEval(gogomacro(form), null),
    apply,
  }
}

const print = (x) => {
  if (typeof x === 'string') return x
  if (!Array.isArray(x)) throw new Error(`cannot print ${x}`)
  return `[${x.map(print).join(' ')}]`
}

const number = (s) => {
  const n = Number(s)
  if (isNaN(n)) throw new Error('expected number, found: ' + s)
  return n
}

const mkFuncEnv = ({ log }) => {
  const funcEnv = new Map()
  const assert = (cond, msg) => {
    if (!cond) throw new Error('built in failed: ' + msg)
  }
  // would be cool to do in a host-func special form
  funcEnv.set('add', (a, b) => String((number(a) + number(b)) | 0))
  funcEnv.set('sub', (a, b) => String((number(a) - number(b)) | 0))
  funcEnv.set('mul', (a, b) => String((number(a) * number(b)) | 0))

  funcEnv.set('bit-and', (a, b) => String((number(a) & number(b)) | 0))
  funcEnv.set('bit-or', (a, b) => String(number(a) | number(b) | 0))
  funcEnv.set('bit-xor', (a, b) => String((number(a) ^ number(b)) | 0))

  const boolToWord = (b) => (b ? '1' : '0')

  funcEnv.set('eq', (a, b) => {
    // should we allow eq to compare non numbers?
    assert(typeof a === 'string' && typeof b === 'string', 'eq expects strings only' + a + ' ' + b)
    return boolToWord(a === b)
  })
  funcEnv.set('lt', (a, b) => boolToWord(number(a) < number(b)))
  funcEnv.set('gt', (a, b) => boolToWord(number(a) > number(b)))
  funcEnv.set('ge', (a, b) => boolToWord(number(a) >= number(b)))
  funcEnv.set('le', (a, b) => boolToWord(number(a) <= number(b)))

  funcEnv.set('is-word', (s) => boolToWord(typeof s === 'string'))
  funcEnv.set('is-list', (f) => boolToWord(Array.isArray(f)))

  funcEnv.set('size', (a) => String(Number(a.length)))
  funcEnv.set('at', (v, i) => {
    const ni = number(i)
    assert(ni >= -v.length && ni < v.length, 'index out of bounds: ' + i)
    if (typeof v === 'string') return String(v.at(ni).charCodeAt(0))
    const elem = v.at(ni)
    if (typeof elem === 'number') return String(elem)
    return elem
  })
  funcEnv.set('slice', (v, i, j) => {
    let s = v.slice(number(i), number(j))
    if (s instanceof Uint8Array) return Object.freeze(Array.from(s, (n) => String(n)))
    return Object.freeze(s)
  })
  // would be nice to do without these two, as we would prefer no builtin var args
  funcEnv.set('concat', (...args) => Object.freeze(args.flat()))
  funcEnv.set('concat-words', (...ws) => ws.join(''))

  funcEnv.set('mutable-list', () => [])
  funcEnv.set('push', (ar, e) => {
    if (!Array.isArray(ar)) throw new Error('push expects array')
    if (Object.isFrozen(ar)) throw new Error('push expects mutable array')
    ar.push(e)
    return unit
  })

  funcEnv.set('freeze', (ar) => Object.freeze(ar))
  const inDecIntRegex = /^[0-9]+$/
  const isDecIntWord = (s) => inDecIntRegex.test(s)
  funcEnv.set('word', (cs) => {
    assert(Array.isArray(cs), 'word expects array: ' + cs)
    // assert(cs.length > 0, 'word expects non-empty array')
    return cs
      .map((c) => {
        if (typeof c !== 'string') throw new Error('word expects words')
        assert(isDecIntWord(c), 'word expects word chars: ' + c)
        const s = String.fromCharCode(number(c))
        // assert(isWordChar(s), 'word expects word chars: '+s)
        return s
      })
      .join('')
  })
  let gensym = 0
  funcEnv.set('gensym', () => String(gensym++))
  funcEnv.set('log', (a) => {
    log(print(a))
    return unit
  })

  funcEnv.set('abort', () => {
    throw new Error("wuns 'abort'")
  })

  return funcEnv
}

const flattenForm = (form) => {
  if (form.text) return form.text
  if (!Array.isArray(form)) throw new Error('flattenForm expects array or text')
  return form.map(flattenForm)
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

const interpretCurrentFile = () => {
  const outputChannel = window.createOutputChannel('wuns output')
  outputChannel.show()
  const document = getActiveTextEditorDocument()
  const { tree } = cacheFetchOrParse(document)
  const funcEnv = mkFuncEnv({ log: (s) => outputChannel.appendLine(s) })
  const { gogoeval } = makeEvaluator(funcEnv)
  for (const child of tree.rootNode.children) gogoeval(flattenForm(treeToOurForm(child)))
  window.showInformationMessage('interpreted ' + tree.rootNode.children.length + ' forms')
}

const parseString = (sourceCodeString) => {
  const tree = parser.parse(sourceCodeString)
  const root = tree.rootNode
  return root.children.map(treeToOurForm)
}

const parseAll = (s) => parseString(s).map(flattenForm)

const { watchFile, readFileSync } = require('fs')

const crypto = require('crypto')

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('starting wuns lang extension: ' + context.extensionPath)

  const wunsFilePath = context.extensionPath + '/wuns/sem-tok.wuns'
  let activeDocument = null
  let tokensBuilder = null
  const textEncoder = new TextEncoder()
  const getDocumentText = (line) => {
    const lineNum = number(line)
    if (isNaN(lineNum) || lineNum < 0 || !activeDocument) return new Uint8Array(0)
    const lineText = activeDocument.lineAt(lineNum)
    if (!lineText) return new Uint8Array(0)
    return textEncoder.encode(lineText.text)
  }
  const pushToken = (...args) => {
    const [line, column, length, tokenType, tokenModifiers] = args.map(number)
    tokensBuilder.push(line, column, length, tokenType, tokenModifiers)
  }
  const funcEnv = mkFuncEnv({ log: (s) => console.log(s) })
  funcEnv.set('document-line-text', getDocumentText)
  funcEnv.set('push-token', pushToken)
  const { gogoeval, apply } = makeEvaluator(funcEnv)

  const load = () => {
    const content = readFileSync(wunsFilePath, 'utf8')
    const topLevelList = parseAll(content)
    try {
      for (const form of topLevelList) gogoeval(form)
    } catch (e) {
      console.error('interpret error', e)
    }
  }
  load()
  watchFile(wunsFilePath, { interval: 100 }, load)

  const onDidChangeSemanticTokensListeners = []
  let overrideSymToks = null

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
  const provideDocumentSemanticTokens = (document, cancellingToken) => {
    if (overrideSymToks && overrideSymToks.fileName === document.fileName) {
      const symToks = overrideSymToks.data
      overrideSymToks = null
      console.log('overriding semantic tokens', symToks)
      return symToks
    }
    const stopWatch = makeStopWatch()
    const { tree } = cacheFetchOrParse(document)
    const { tokensBuilder, build } = tokenBuilderForParseTree()
    tree.rootNode.children.forEach(build)
    const semtoks = tokensBuilder.build()
    console.log('semantic tokens time taken', stopWatch(), 'ms', document.version)
    const semtokHash = crypto.createHash('sha256').update(semtoks.data).digest('hex')
    console.log({ semtoksCount: semtoks.data.length, semtokHash, file: document.fileName, version: document.version })

    return semtoks
  }

  context.subscriptions.push(
    commands.registerCommand('wunslang.semanticTokens', () => {
      const f = funcEnv.get('provide-document-semantic-tokens')
      if (!f) return
      activeDocument = getActiveTextEditorDocument()
      if (!activeDocument) return
      console.log('active document', activeDocument.fileName)
      tokensBuilder = new SemanticTokensBuilder(legend)
      {
        const res = apply(f, [String(activeDocument.lineCount)])
        window.showInformationMessage('eval result: ' + print(res))
      }
      const semtoks = tokensBuilder.build('1')
      overrideSymToks = { fileName: activeDocument.fileName, data: semtoks }
      tokensBuilder = null
      console.log('wuns semtoks', semtoks)
      console.log('calling listeners', onDidChangeSemanticTokensListeners.length)
      for (const listener of onDidChangeSemanticTokensListeners) listener()
    }),
    commands.registerCommand('wunslang.interpret', interpretCurrentFile),
  )

  const onDidChangeSemanticTokens = (listener, thisArgs, disposables) => {
    console.log('onDidChangeSemanticTokens')
    onDidChangeSemanticTokensListeners.push(listener)
    return { dispose: () => {} }
  }
  const semanticTokensProvider = {
    onDidChangeSemanticTokens,
    provideDocumentSemanticTokens,
    // provideDocumentSemanticTokensEdits,
  }

  const selector = { language: 'wuns', scheme: 'file' }

  context.subscriptions.push(
    languages.registerDocumentSemanticTokensProvider(selector, semanticTokensProvider, legend),
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
