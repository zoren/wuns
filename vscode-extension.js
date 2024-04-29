const isWordCharCode = (cc) => {
  return (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 46 || cc === 61 || cc === 45
}

const isWordString = (s) => {
  if (s.length === 0) return false
  for (let i = 0; i < s.length; i++) if (!isWordCharCode(s.charCodeAt(i))) return false
  return true
}

/**
 * @param {vscode.TextDocument} document
 */
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
  while (!done) topLevelList.push(go())
  return topLevelList
}

const vscode = require('vscode')

const { SemanticTokensLegend, SemanticTokensBuilder, languages } = vscode

const tokenTypes = [
  'variable',
  'keyword',
  'function',
  'macro',
  'parameter',
  'string',
  'number',
  // 'method',
  // 'property',
  // 'operator',
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
          let pi = 0
          for (const parameter of parameters) {
            if (pi++ === parameters.length - 2 && parameter.text === '..') {
              pushToken(parameter, keywordTokenType)
            } else pushToken(parameter, parameterTokenType)
          }
          for (const child of body) go(child)
          break
        }
        default:
          pushToken(head, functionTokenType)
          for (const arg of tail) go(arg)
          break
      }
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
  const apply = ({ params, restParam, bodies }, args) => {
    const varValues = new Map()
    for (let i = 0; i < params.length; i++) varValues.set(params[i], args[i])
    if (restParam) varValues.set(restParam, makeList(...args.slice(params.length)))
    const inner = { varValues, outer: null }
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

const { commands, window } = vscode

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
  const topLevelList = parseDocument(document)
  const funcEnv = mkFuncEnv({ log: (s) => outputChannel.appendLine(s) })
  const { gogoeval } = makeEvaluator(funcEnv)
  for (const form of topLevelList) gogoeval(flattenForm(form))
  window.showInformationMessage('interpreted ' + topLevelList.length + ' forms')
}

const parseAll = (s) => {
  const assert = (cond, msg) => {
    if (!cond) throw new Error('assert failed: ' + msg)
  }

  const isWhitespace = (c) => c === ' ' || c === '\n'

  const isWordChar = (c) => /[a-z0-9.=]|-/.test(c)

  let index = 0
  const lexNext = () => {
    while (index < s.length) {
      const tokStart = index
      const c = s[index++]
      if (isWhitespace(c)) continue
      if (c === '[' || c === ']') return c
      assert(isWordChar(c), `illegal character ${c}`)
      while (index < s.length && isWordChar(s[index])) index++
      return s.slice(tokStart, index)
    }
    return null
  }

  let token
  const nextToken = () => {
    token = lexNext()
    return null
  }
  nextToken()
  const go = () => {
    {
      const peekTok = token
      nextToken()
      if (peekTok !== '[') {
        if (peekTok === ']') throw new Error('unexpected ]')
        if (!isWordString(peekTok)) throw new Error('unexpected token: ' + peekTok)
        return peekTok
      }
    }
    const list = []
    while (true) {
      if (token === null) break
      if (token === ']') {
        nextToken()
        break
      }
      list.push(go())
    }
    return makeList(...list)
  }

  const forms = []
  while (true) {
    if (token === null) break
    if (token === ']') {
      nextToken()
      continue
    }
    forms.push(go())
  }
  return forms
}

const { watchFile, readFileSync } = require('fs')

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
    console.log('push-token', { line, column, length, tokenType, tokenModifiers })
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
   * @param {vscode.TextDocument} document
   */
  const provideDocumentSemanticTokens = (document, cancellingToken) => {
    if (overrideSymToks && overrideSymToks.fileName === document.fileName) {
      const symToks = overrideSymToks.data
      overrideSymToks = null
      console.log('overriding semantic tokens', symToks)
      return symToks
    }
    const before = performance.now()
    const topLevelList = parseDocument(document)
    const { tokensBuilder, build } = tokenBuilderForParseTree()
    for (const node of topLevelList) build(node)
    const semtoks = tokensBuilder.build('1')
    console.log({ semtoks })
    const after = performance.now()
    const elapsed = after - before
    console.log('time taken', Math.round(elapsed * 1000) / 1000, 'ms', document.version)
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
  const provider = {
    onDidChangeSemanticTokens,
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
