const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, SelectionRange, Range, Position } = vscode

const makeStopWatch = () => {
  const before = performance.now()
  return () => {
    const elapsed = performance.now() - before
    return Math.round(elapsed * 1000) / 1000
  }
}

const TSParser = require('tree-sitter')

/**
 * @param {vscode.TextDocument} document
 * @param {TSParser.Tree} oldTree
 * @returns {{tree: TSParser.Tree}} cache
 */
let parseDocumentTreeSitter = null

const wunsLanguageId = 'wuns'

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

/**
 * @param {vscode.TextDocument} document
 */
const makeProvideDocumentSemanticTokensForms = async () => {
  const { tryGetFormWord, tryGetFormList, meta } = await import('./esm/core.js')
  const { treeToFormsSafe, makeDefEnv, evalForm, isClosure } = await import('./esm/mini-lisp.js')
  const defEnv = makeDefEnv()
  const provideDocumentSemanticTokens = (document) => {
    const tokensBuilder = new SemanticTokensBuilder(legend)
    try {
      const pushTokenWithModifier = (form, tokenType, tokenModifiers) => {
        if (!form) return console.error('no form')
        const word = tryGetFormWord(form)
        if (!word) return console.error('expected word')
        const formMetaList = meta(form)
        if (!formMetaList) return
        if (!Array.isArray(formMetaList)) return console.error('no form meta list')
        const [contentName, row, column] = formMetaList
        tokensBuilder.push(row, column, word.length, tokenType, tokenModifiers)
      }
      const pushToken = (form, tokenType) => pushTokenWithModifier(form, tokenType, 0)
      const emptyList = Object.freeze([])
      const getListOrEmpty = (form) => {
        return tryGetFormList(form) || emptyList
      }
      const goType = (form) => {
        if (!form) return
        if (tryGetFormWord(form)) pushToken(form, typeTokenType)
        else getListOrEmpty(form).forEach(goType)
      }
      const go = (form) => {
        if (!form) return
        const word = tryGetFormWord(form)
        if (word) {
          pushToken(form, variableTokenType)
          return
        }
        const list = tryGetFormList(form)
        if (!list) {
          console.error('expected list', form)
          return
        }
        if (list.length === 0) return
        const [head, ...tail] = list
        const headWord = tryGetFormWord(head)
        const funcSpecial = () => {
          const [name, paramsForm, body] = tail
          pushToken(name, headWord === 'macro' ? macroTokenType : functionTokenType)
          const params = tryGetFormList(paramsForm)
          if (params) for (const param of params) pushToken(param, parameterTokenType)
          go(body)
        }
        const specialForms = {
          i32: () => {
            pushToken(tail[0], tokenTypeNumber)
          },
          f64: () => {
            pushToken(tail[0], tokenTypeNumber)
          },
          word: () => {
            pushToken(tail[0], stringTokenType)
          },
          quote: () => {
            const goQuote = (form) => {
              if (tryGetFormWord(form)) pushToken(form, stringTokenType)
              else getListOrEmpty(form).forEach(goQuote)
            }
            const [quoteForm] = tail
            if (quoteForm) goQuote(quoteForm)
          },
          if: () => {
            for (const form of tail) go(form)
          },
          match: () => {
            for (const form of tail) go(form)
          },
          do: () => {
            for (const form of tail) go(form)
          },
          let: () => {
            const [bindingsForm, body] = tail
            const bindings = getListOrEmpty(bindingsForm)
            for (let i = 0; i < bindings.length - 1; i += 2) {
              pushTokenWithModifier(bindings[i], variableTokenType, declarationModifier)
              go(bindings[i + 1])
            }
            go(body)
          },
          func: funcSpecial,
          fexpr: funcSpecial,
          macro: funcSpecial,
          def: () => {
            const [cname, val] = tail
            pushTokenWithModifier(cname, variableTokenType, declarationModifier)
            go(val)
          },
          extern: () => {
            for (const form of tail) if (tryGetFormWord(form)) pushToken(form, stringTokenType)
          },
          intrinsic: () => {
            for (const form of tail) if (tryGetFormWord(form)) pushToken(form, stringTokenType)
          },
          atom: () => {
            go(tail[0])
          },
          'type-anno': () => {
            go(tail[0])
            goType(tail[1])
          },
          type: () => {
            for (let i = 0; i < tail.length; i += 3) {
              pushTokenWithModifier(tail[i], typeTokenType, declarationModifier)
              for (const typeParam of getListOrEmpty(tail[i + 1])) pushToken(typeParam, parameterTokenType)
              goType(tail[i + 2])
            }
          },
        }
        if (headWord) {
          const specialHandler = specialForms[headWord]
          if (specialHandler) {
            // console.log('special form', headWord)
            pushToken(head, keywordTokenType)
            specialHandler(tail)
            return
          }
          // check if headWord is a defed macro or fexpr, or a func
          const headValue = defEnv.get(headWord)
          if (isClosure(headValue)) {
            switch (headValue.kind) {
              case 'macro': {
                pushToken(head, macroTokenType)
                const macroResult = headValue(...tail)
                go(macroResult)
                return
              }
              case 'fexpr':
                pushToken(head, functionTokenType)
                return
              case 'func':
                pushToken(head, functionTokenType)
                for (const form of tail) go(form)
                return
              default:
                throw new Error('unexpected closure kind')
            }
          }
          pushToken(head, functionTokenType)
          for (const form of tail) go(form)
          return
        }
        go(head)
        for (const form of tail) go(form)
      }

      const tree = parseDocumentTreeSitter(document)
      const forms = treeToFormsSafe(tree, document.fileName)

      for (const form of forms) {
        try {
          evalForm(defEnv, form)
        } catch (e) {
          console.error('provideDocumentSemanticTokensForms evalForm error', e.message)
          console.error(e)
          console.error(meta(form))
        }
        go(form)
      }
    } catch (e) {
      console.error('provideDocumentSemanticTokensForms error catch', e)
    }
    return tokensBuilder.build()
  }
  return {
    provideDocumentSemanticTokens,
  }
}

const { languages } = vscode

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
  const tree = parseDocumentTreeSitter(document)
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
    if (tree.rootNode.hasError) console.error('tree-sitter error')
    console.log('parse treesitter took', watch(), 'ms', document.fileName)
    return tree
  }
  console.log('starting wuns lang extension: ' + context.extensionPath)

  const selector = { language: wunsLanguageId, scheme: 'file' }
  const documentSemanticTokensProvider = await makeProvideDocumentSemanticTokensForms()
  context.subscriptions.push(
    languages.registerDocumentSemanticTokensProvider(selector, documentSemanticTokensProvider, legend),
    languages.registerSelectionRangeProvider(selector, { provideSelectionRanges }),
  )
  console.log('Congratulations, your extension "wunslang" is now active!')
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
