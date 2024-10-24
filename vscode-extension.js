const vscode = require('vscode')
const path = require('path')
const { SemanticTokensLegend, SemanticTokensBuilder, SelectionRange, Range, Position } = vscode

const makeStopWatch = () => {
  const before = performance.now()
  return () => {
    const elapsed = performance.now() - before
    return Math.round(elapsed * 1000) / 1000
  }
}

/**
 * @typedef {import('tree-sitter').TSParser} TSParser
 */

/**
 * @param {vscode.TextDocument} document
 * @returns {TSParser.Tree}
 */
let parseDocumentTreeSitter = null

const wunsLanguageId = 'wuns'

// https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide
const tokenTypes = [
  'variable',
  'keyword',
  'function',
  'macro',
  'parameter',
  'string',
  'number',
  'comment',
  'type',

  'operator',
  'typeParameter',
  'enum',
  'enumMember',
]

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
const tokenTypeOperator = tokenTypesMap.get('operator')
const typeParameterTokenType = tokenTypesMap.get('typeParameter')
const enumTokenType = tokenTypesMap.get('enum') // could be used on union type declarations
const enumMemberTokenType = tokenTypesMap.get('enumMember')

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
  const { makeDefEnv, tryGetClosureKind, tryGetFormWord, tryGetFormList, treeToFormsSafeNoMeta, tryGetNodeFromForm } =
    await import('./esm/core.js')
  const { makeEvalForm } = await import('./esm/interpreter.js')
  const { default: externs } = await import('./esm/runtime-lib/externs.js')
  const provideDocumentSemanticTokens = (document) => {
    const { fileName } = document
    const defEnv = makeDefEnv(path.dirname(fileName))
    const evalForm = makeEvalForm(externs, defEnv)

    const tokensBuilder = new SemanticTokensBuilder(legend)
    const tree = parseDocumentTreeSitter(document)
    const topForms = treeToFormsSafeNoMeta(tree)
    try {
      const pushTokenWithModifier = (form, tokenType, tokenModifiers) => {
        if (!form) return
        const word = tryGetFormWord(form)
        if (!word) return console.error('expected word')
        const node = tryGetNodeFromForm(form)
        if (!node) return
        // ignore if not in the same file, this can happen with macros
        if (node.tree.contentName !== fileName) return
        const { row, column } = node.startPosition
        tokensBuilder.push(row, column, word.length, tokenType, tokenModifiers)
      }
      const pushToken = (form, tokenType) => pushTokenWithModifier(form, tokenType, 0)
      const emptyList = Object.freeze([])
      const getListOrEmpty = (form) => tryGetFormList(form) || emptyList
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
        const runForm = () => {
          try {
            // eval for side effects so macros are defined and can be expanded
            // todo only eval def and do forms, to avoid evaling top level forms, that may crash
            evalForm(form)
          } catch (e) {
            console.error('provideDocumentSemanticTokensForms evalForm error', e.message)
            console.error(e)
          }
        }
        const funcSpecial = (headWord, [name, paramsForm, ...bodies]) => {
          pushToken(name, headWord === 'macro' ? macroTokenType : functionTokenType)
          for (const param of getListOrEmpty(paramsForm)) pushToken(param, parameterTokenType)
          for (const body of bodies) go(body)
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
          if: () => {
            for (const form of tail) go(form)
          },
          switch: () => {
            go(tail[0])
            for (let i = 1; i < tail.length - 1; i += 2) {
              const constForm = tail[i]
              for (const form of getListOrEmpty(constForm)) go(form)
              go(tail[i + 1])
            }
            go(tail.at(-1))
          },
          match: () => {
            go(tail[0])
            for (let i = 1; i < tail.length - 1; i += 2) {
              const patternList = getListOrEmpty(tail[i])
              pushToken(patternList[0], enumMemberTokenType)
              for (let j = 1; j < patternList.length; j++)
                pushTokenWithModifier(patternList[j], variableTokenType, declarationModifier)
              go(tail[i + 1])
            }
            if (tail.length % 2 === 0) go(tail.at(-1))
          },
          do: () => {
            for (const form of tail) go(form)
          },
          let: () => {
            const [bindingsForm, ...bodies] = tail
            const bindings = getListOrEmpty(bindingsForm)
            for (let i = 0; i < bindings.length - 1; i += 2) {
              pushTokenWithModifier(bindings[i], variableTokenType, declarationModifier)
              go(bindings[i + 1])
            }
            for (const body of bodies) go(body)
          },
          letfn: () => {
            const [functionsForm, body] = tail
            for (const func of getListOrEmpty(functionsForm)) {
              const [head, ...tail] = getListOrEmpty(func)
              const headWord = tryGetFormWord(head)
              if (headWord !== 'func' && headWord !== 'fexpr' && headWord !== 'macro') continue
              pushToken(head, keywordTokenType)
              funcSpecial(headWord, tail)
            }
            go(body)
          },
          func: () => funcSpecial(headWord, tail),
          defn: () => {
            funcSpecial(headWord, tail)
            runForm()
          },
          defexpr: () => {
            funcSpecial(headWord, tail)
            runForm()
          },
          defmacro: () => {
            funcSpecial(headWord, tail)
            runForm()
          },
          def: () => {
            const [cname, val] = tail
            pushTokenWithModifier(cname, variableTokenType, declarationModifier)
            go(val)
            runForm()
          },
          extern: () => {
            for (const form of tail) pushToken(form, stringTokenType)
          },
          intrinsic: () => {
            pushToken(form[0], tokenTypeOperator)
          },
          'type-anno': () => {
            go(tail[0])
            goType(tail[1])
          },
          type: () => {
            for (let i = 0; i < tail.length; i += 3) {
              pushTokenWithModifier(tail[i], typeTokenType, declarationModifier)
              for (const typeParam of getListOrEmpty(tail[i + 1])) pushToken(typeParam, typeParameterTokenType)
              goType(tail[i + 2])
            }
            runForm()
          },
          load: () => {
            if (tail.length === 1 && tryGetFormWord(tail[0])) pushToken(tail[0], stringTokenType)
            runForm()
          },
          export: () => {
            for (const form of tail) pushToken(form, variableTokenType)
          }
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
          switch (tryGetClosureKind(headValue)) {
            case 'macro':
              pushToken(head, macroTokenType)
              go(headValue(...tail))
              return
            case 'fexpr':
              pushToken(head, functionTokenType)
              const goQuote = (form) => {
                if (tryGetFormWord(form)) pushToken(form, stringTokenType)
                else getListOrEmpty(form).forEach(goQuote)
              }
              for (const form of tail) goQuote(form)
              return
            case 'func':
              pushToken(head, functionTokenType)
              for (const form of tail) go(form)
              return
            case null:
              break
            default:
              throw new Error('unexpected closure kind')
          }
          pushToken(head, functionTokenType)
          for (const form of tail) go(form)
          return
        }
        go(head)
        for (const form of tail) go(form)
      }

      for (const topForm of topForms) go(topForm)
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
      if (node.namedChildCount === 0) return new SelectionRange(range, parentSelectionRange)
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
  const { parseTagTreeSitter } = await import('./esm/core.js')
  parseDocumentTreeSitter = (document) => {
    const watch = makeStopWatch()
    const tree = parseTagTreeSitter(document.getText(), document.fileName)
    if (tree.rootNode.hasError) console.error('tree-sitter error', document.fileName)
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
