const isWordCharCode = (cc) => {
  return (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) || cc === 46 || cc === 61 || cc === 45
}

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

let prevSemTokens = null

/**
 * @param {vscode.TextDocument} document
 */
const provideDocumentSemanticTokens = (document, cancellingToken) => {
  const before = performance.now()
  if (prevSemTokens !== null && prevSemTokens.version === document.version) return prevSemTokens
  const topLevelList = parseDocument(document)
  const { tokensBuilder, build } = tokenBuilderForParseTree()
  for (const node of topLevelList) build(node)
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

const unit = Object.freeze([])
const makeList = (...args) => (args.length === 0 ? unit : Object.freeze(args))

const symbolContinue = Symbol.for('wuns-continue')

const makeEvaluator = (funcEnv) => {
  const apply = (f, args) => {
    const { params, restParam, bodies } = f
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
        const [fname, origParams, ...bodies] = args
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
        return makeList(firstWord, ...args.map(gogomacro))
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        return makeList(
          firstWord,
          bindings.map((borf, i) => (i % 2 === 0 ? borf : gogomacro(borf))),
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

const mkFuncEnv = ({ log }) => {
  const funcEnv = new Map()
  const assert = (cond, msg) => {
    if (!cond) throw new Error('built in failed: ' + msg)
  }

  // would be cool to do in a host-func special form
  funcEnv.set('add', (a, b) => String((Number(a) + Number(b)) | 0))
  funcEnv.set('sub', (a, b) => String((Number(a) - Number(b)) | 0))
  funcEnv.set('mul', (a, b) => String((Number(a) * Number(b)) | 0))

  funcEnv.set('bit-and', (a, b) => String((Number(a) & Number(b)) | 0))
  funcEnv.set('bit-or', (a, b) => String(Number(a) | Number(b) | 0))
  funcEnv.set('bit-xor', (a, b) => String((Number(a) ^ Number(b)) | 0))

  const boolToWord = (b) => (b ? '1' : '0')

  funcEnv.set('eq', (a, b) => {
    assert(typeof a === 'string', 'eq expects strings')
    assert(typeof b === 'string', 'eq expects strings')
    return boolToWord(a === b)
  })
  funcEnv.set('lt', (a, b) => boolToWord(Number(a) < Number(b)))
  funcEnv.set('gt', (a, b) => boolToWord(Number(a) > Number(b)))
  funcEnv.set('ge', (a, b) => boolToWord(Number(a) >= Number(b)))
  funcEnv.set('le', (a, b) => boolToWord(Number(a) <= Number(b)))

  funcEnv.set('is-word', (s) => boolToWord(typeof s === 'string'))
  funcEnv.set('is-list', (f) => boolToWord(Array.isArray(f)))

  funcEnv.set('size', (a) => String(Number(a.length)))
  funcEnv.set('at', (v, i) => {
    const ni = Number(i)
    assert(ni >= -v.length && ni < v.length, 'index out of bounds: ' + i)
    if (typeof v === 'string') return String(v.at(ni).charCodeAt(0))
    return v.at(ni)
  })
  funcEnv.set('slice', (v, i, j) => Object.freeze(v.slice(Number(i), Number(j))))
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
        const s = String.fromCharCode(parseInt(c, 10))
        // assert(isWordChar(s), 'word expects word chars: '+s)
        return s
      })
      .join('')
  })
  let gensym = 0
  funcEnv.set('gensym', () => String(gensym++))
  funcEnv.set('log', (a) => log(print(a)))

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

const interpretCurrentFile = () => {
  const outputChannel = window.createOutputChannel('wuns output')
  outputChannel.show()
  const { activeTextEditor } = window
  if (!activeTextEditor) return
  const { document } = activeTextEditor
  const topLevelList = parseDocument(document)
  const funcEnv = mkFuncEnv({ log: (s) => outputChannel.appendLine(s) })
  const { gogoeval } = makeEvaluator(funcEnv)
  for (const form of topLevelList) gogoeval(flattenForm(form))
  window.showInformationMessage('interpreted ' + topLevelList.length + ' forms')
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('starting wuns lang extension: ' + context.extensionPath)

  context.subscriptions.push(
    commands.registerCommand('wunslang.helloWorld', () => {
      window.showInformationMessage('wuns [here] 007 [if [quote 32]]')
    }),
    commands.registerCommand('wunslang.interpret', interpretCurrentFile),
  )

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
