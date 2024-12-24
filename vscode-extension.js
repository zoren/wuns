const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, SelectionRange, Range, Position, Uri } = vscode

const makeStopWatch = () => {
  const before = performance.now()
  return () => {
    const elapsed = performance.now() - before
    return Math.round(elapsed * 1000) / 1000
  }
}

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

const tokenModifiersMap = new Map(tokenModifiers.map((mod, index) => [mod, index]))

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
  const { parseString, tryGetFormInfo, tryGetFormWord, tryGetFormList, getFormInfoAsRange } = await import(
    './esm/core.js'
  )
  const { makeJSCompilingEvaluator } = await import('./esm/compiler-js.js')

  const provideDocumentSemanticTokens = async (document) => {
    const { evalTop, getDef, getDefKind } = makeJSCompilingEvaluator()

    const tokensBuilder = new SemanticTokensBuilder(legend)
    const pushTokenWithModifier = (form, tokenType, tokenModifiers) => {
      if (!form) return
      const word = tryGetFormWord(form)
      if (!word) return console.error('expected word')
      const info = tryGetFormInfo(form)
      if (!info) return
      const { start } = getFormInfoAsRange(info)
      const { row, column } = start
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
    const letLoopSpecial = (_headWord, tail) => {
      const [bindingsForm, ...bodies] = tail
      const bindings = getListOrEmpty(bindingsForm)
      for (let i = 0; i < bindings.length - 1; i += 2) {
        pushTokenWithModifier(bindings[i], variableTokenType, declarationModifier)
        goExp(bindings[i + 1])
      }
      for (const body of bodies) goExp(body)
    }
    const funcSpecial = (headWord, [name, paramsForm, ...bodies]) => {
      pushToken(name, headWord === 'macro' ? macroTokenType : functionTokenType)
      for (const param of getListOrEmpty(paramsForm)) pushToken(param, parameterTokenType)
      for (const body of bodies) goExp(body)
    }
    const expSpecialForms = {
      i32: (_headWord, tail) => {
        pushToken(tail[0], tokenTypeNumber)
      },
      f64: (_headWord, tail) => {
        pushToken(tail[0], tokenTypeNumber)
      },
      word: (_headWord, tail) => {
        pushToken(tail[0], stringTokenType)
      },
      if: (_headWord, tail) => {
        for (const form of tail) goExp(form)
      },
      switch: (_headWord, tail) => {
        goExp(tail[0])
        for (let i = 1; i < tail.length - 1; i += 2) {
          const constForm = tail[i]
          for (const form of getListOrEmpty(constForm)) goExp(form)
          goExp(tail[i + 1])
        }
        if (tail.length % 2 === 0) goExp(tail.at(-1))
      },
      match: (_headWord, tail) => {
        goExp(tail[0])
        for (let i = 1; i < tail.length - 1; i += 2) {
          const patternList = getListOrEmpty(tail[i])
          pushToken(patternList[0], enumMemberTokenType)
          for (let j = 1; j < patternList.length; j++)
            pushTokenWithModifier(patternList[j], variableTokenType, declarationModifier)
          goExp(tail[i + 1])
        }
        if (tail.length % 2 === 0) goExp(tail.at(-1))
      },
      do: (_headWord, tail) => {
        for (const form of tail) goExp(form)
        // if at top level or inside a do at top level we need to eval def forms
      },
      let: letLoopSpecial,
      loop: letLoopSpecial,
      continue: (_headWord, tail) => {
        for (let i = 0; i < tail.length; i += 2) {
          pushTokenWithModifier(tail[i], variableTokenType, modificationModifier)
          goExp(tail[i + 1])
        }
      },
      letfn: (_headWord, tail) => {
        const [functionsForm, ...bodies] = tail
        for (const func of getListOrEmpty(functionsForm)) {
          const [head, ...tail] = getListOrEmpty(func)
          const fnHeadWord = tryGetFormWord(head)
          if (fnHeadWord !== 'func' && fnHeadWord !== 'fexpr' && fnHeadWord !== 'macro') continue
          pushToken(head, keywordTokenType)
          funcSpecial(fnHeadWord, tail)
        }
        for (const body of bodies) goExp(body)
      },
      func: funcSpecial,
      intrinsic: (_headWord, tail) => {
        pushToken(tail[0], tokenTypeOperator)
      },
    }
    const topSpecialForms = {
      defn: (headWord, tail) => {
        funcSpecial(headWord, tail)
      },
      defexpr: (headWord, tail) => {
        funcSpecial(headWord, tail)
      },
      defmacro: (headWord, tail) => {
        funcSpecial(headWord, tail)
      },
      def: (_headWord, tail) => {
        const [cname, val] = tail
        pushTokenWithModifier(cname, variableTokenType, declarationModifier)
        goExp(val)
      },
      type: (_headWord, tail) => {
        for (let i = 0; i < tail.length; i += 3) {
          pushTokenWithModifier(tail[i], typeTokenType, declarationModifier)
          for (const typeParam of getListOrEmpty(tail[i + 1])) pushToken(typeParam, typeParameterTokenType)
          goType(tail[i + 2])
        }
      },
      load: (_headWord, tail) => {
        if (tail.length === 1 && tryGetFormWord(tail[0])) pushToken(tail[0], stringTokenType)
      },
      do: (_headWord, tail) => {
        for (const form of tail) goTop(form)
        // if at top level or inside a do at top level we need to eval def forms
      },
      import: (_headWord, tail) => {
        pushToken(tail[0], stringTokenType)
        pushTokenWithModifier(tail[1], variableTokenType, declarationModifier)
        goType(tail[2])
      },
    }

    const goExp = (form) => {
      if (!form) return
      if (tryGetFormWord(form)) {
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
      if (!headWord) {
        goExp(head)
        for (const form of tail) goExp(form)
        return
      }
      const expSpecialHandler = expSpecialForms[headWord]
      if (expSpecialHandler) {
        pushToken(head, keywordTokenType)
        expSpecialHandler(headWord, tail)
        return
      }
      const topSpecialHandler = topSpecialForms[headWord]
      if (topSpecialHandler) {
        pushToken(head, keywordTokenType)
        topSpecialHandler(headWord, tail)
        return console.error('top special form not allowed in exp', headWord)
      }
      // check if headWord is a defed macro or fexpr, or a func
      switch (getDefKind(headWord)) {
        case 'defmacro': {
          pushToken(head, macroTokenType)
          const headValue = getDef(headWord)
          goExp(headValue(...tail))
          return
        }
        case 'defexpr':
          pushToken(head, functionTokenType)
          const goQuote = (form) => {
            if (tryGetFormWord(form)) pushToken(form, stringTokenType)
            else getListOrEmpty(form).forEach(goQuote)
          }
          for (const form of tail) goQuote(form)
          return
        case 'defn':
        default:
          pushToken(head, functionTokenType)
          for (const form of tail) goExp(form)
          return
      }
    }
    const goTop = async (form) => {
      if (!form) return
      const list = tryGetFormList(form)
      if (!list) {
        console.error('expected list', form)
        return
      }
      if (list.length === 0) return
      try {
        await evalTop(form)
      } catch (e) {
        console.error('provideDocumentSemanticTokensForms evalForm error', e.message)
        console.error(e)
      }
      const [head, ...tail] = list
      const headWord = tryGetFormWord(head)
      if (!headWord) {
        // goTop(head)
        // for (const form of tail) goTop(form)
        return console.error('expected word')
      }
      const topSpecialHandler = topSpecialForms[headWord]
      if (topSpecialHandler) {
        pushToken(head, keywordTokenType)
        topSpecialHandler(headWord, tail)
        return
      }
      const expSpecialHandler = expSpecialForms[headWord]
      if (expSpecialHandler) {
        pushToken(head, keywordTokenType)
        expSpecialHandler(headWord, tail)
        const node = tryGetNodeFromForm(form)
        return console.error('exp special form not allowed at top level', headWord, node, node.startPosition)
      }
      pushToken(head, getDefKind(headWord) === 'defmacro' ? macroTokenType : functionTokenType)
    }
    const topForms = parseString(document.getText(), document.fileName)
    try {
      for (const topForm of topForms) await goTop(topForm)
    } catch (e) {
      console.error('provideDocumentSemanticTokensForms error catch', e)
    }
    return tokensBuilder.build()
  }

  return {
    provideDocumentSemanticTokens: (document) => {
      try {
        return provideDocumentSemanticTokens(document)
      } catch (e) {
        console.error('provideDocumentSemanticTokens error catch', e)
      }
    },
  }
}

const pointToPosition = ({ row, column }) => new Position(row, column)

const makeProvideSelectionRanges = async () => {
  const { parseString, tryGetFormInfo, getFormChildren, getFormInfoAsRange } = await import('./esm/core.js')
  const getFormRange = (topForm) => {
    const info = tryGetFormInfo(topForm)
    if (!info) throw new Error('expected info')
    const { start, end } = getFormInfoAsRange(info)
    return new Range(pointToPosition(start), pointToPosition(end))
  }
  /**
   *
   * @param {vscode.TextDocument} document
   * @param {vscode.Position[]} positions
   */
  return (document, positions) => {
    const forms = parseString(document.getText(), document.fileName)
    // todo make selection aware of special forms such as let, where one wants to select bindings(pairs) before entire binding form
    const selRanges = []

    for (const topForm of forms) {
      const topRange = getFormRange(topForm)
      for (const position of positions) {
        if (!topRange.contains(position)) continue
        const go = (form, parentSelectionRange) => {
          for (const child of getFormChildren(form)) {
            const childRange = getFormRange(child)
            if (!childRange.contains(position)) continue
            return go(child, new SelectionRange(childRange, parentSelectionRange))
          }
          return parentSelectionRange
        }
        selRanges.push(go(topForm, new SelectionRange(topRange)))
      }
    }
    return selRanges
  }
}

const { languages, workspace, window, commands } = vscode

/**
 * @returns {vscode.TextDocument}
 */
const getActiveTextEditorDocument = () => {
  const { activeTextEditor } = window
  if (!activeTextEditor) return null
  return activeTextEditor.document
}

const serverityToDiagnosticSeverity = (severity) => {
  const prefix = 'diagnostic-severity/'
  const tag = severity.tag
  if (!tag.startsWith(prefix)) throw new Error('unexpected severity tag')
  switch (tag.slice(prefix.length)) {
    case 'error':
      return vscode.DiagnosticSeverity.Error
    case 'warning':
      return vscode.DiagnosticSeverity.Warning
    case 'info':
      return vscode.DiagnosticSeverity.Information
    case 'hint':
      return vscode.DiagnosticSeverity.Hint
    default:
      throw new Error('unexpected severity')
  }
}

const fsPromises = require('fs').promises
const path = require('path')

const addBindCheckActiveDocumentCommand = async (context) => {
  const { printFormMessage, parseString, print, tryGetFormInfo, getFormInfoAsRange, getFormInfoContentName } =
    await import('./esm/core.js')
  const getFormInfoAsVSCodeRange = (info) => {
    const { start, end } = getFormInfoAsRange(info)
    return new Range(pointToPosition(start), pointToPosition(end))
  }
  const { makeJSCompilingEvaluator } = await import('./esm/compiler-js.js')
  const check2Path = path.join(context.extensionPath, 'wuns/check2.wuns')

  const check2 = await fsPromises.readFile(check2Path, 'ascii')
  const check2Forms = parseString(check2, check2Path)
  const { evalTops, getDef } = makeJSCompilingEvaluator()
  await evalTops(check2Forms)

  const makeGetInfoFromForm = (converter) => {
    const syntaxInfo = converter['syntax-info']
    const tryGetMacroForm = syntaxInfo['try-get-macro-form']
    return (form) => {
      let info = tryGetFormInfo(form)
      if (info) return info
      const optMacroForm = tryGetMacroForm(form)
      if (optMacroForm.tag !== 'option/some') throw new Error('expected macro form')
      const macroForm = optMacroForm.args[0]
      return tryGetFormInfo(macroForm)
    }
  }

  const makeFormToAstConverter = getDef('mk-form-to-ast')

  const diagnosticCollection = languages.createDiagnosticCollection('wuns-bind')
  const bindCheck = async () => {
    const document = getActiveTextEditorDocument()
    if (!document) return console.error('no active text editor')
    const { fileName } = document
    const dirPath = path.dirname(fileName)
    const text = document.getText()
    const forms = parseString(text, path.basename(fileName))
    const converter = makeFormToAstConverter()
    const formToTopAsync = converter['form-to-top-async']
    for (const form of forms) {
      try {
        await formToTopAsync(form)
      } catch (e) {
        console.error('formToTop error', print(form), e)
        break
      }
    }
    const diagnostics = []
    const getInfoFromForm = makeGetInfoFromForm(converter)
    for (const error of converter.errors) {
      const { form, message, severity } = error
      const info = getInfoFromForm(form)
      if (!info) continue
      const diag = new vscode.Diagnostic(
        getFormInfoAsVSCodeRange(info),
        'binding: ' + printFormMessage(message),
        serverityToDiagnosticSeverity(severity),
      )
      diagnostics.push([Uri.file(path.join(dirPath, getFormInfoContentName(info))), [diag]])
    }
    diagnosticCollection.clear()
    diagnosticCollection.set(diagnostics)
  }
  context.subscriptions.push(
    diagnosticCollection,
    commands.registerCommand('wunslang.bindcheck', async () => {
      try {
        await bindCheck()
      } catch (e) {
        console.error('bind check threw error', e)
      }
    }),
  )

  const bindTypeCheckForms = getDef('bind-type-check-forms-converter')

  const bindType = async () => {
    const document = getActiveTextEditorDocument()
    if (!document) return console.error('no active text editor')
    const { fileName } = document
    const dirPath = path.dirname(fileName)
    const infoToUri = (info) => Uri.file(path.join(dirPath, getFormInfoContentName(info)))

    const text = document.getText()
    const forms = parseString(text, path.basename(fileName))

    const diagnostics = []
    const converter = makeFormToAstConverter()
    const checkRes = await bindTypeCheckForms(converter, forms)

    const getInfoFromForm = makeGetInfoFromForm(converter)
    for (const error of checkRes.fst) {
      const { form, message, severity } = error
      const info = getInfoFromForm(form)
      if (!info) continue
      const diag = new vscode.Diagnostic(
        getFormInfoAsVSCodeRange(info),
        'binding: ' + printFormMessage(message),
        serverityToDiagnosticSeverity(severity),
      )
      diagnostics.push([infoToUri(info), [diag]])
    }
    for (const error of checkRes.snd) {
      const { message, severity } = error
      const optForm = error['opt-form']
      if (optForm.tag !== 'option/some') continue
      const form = optForm.args[0]
      const info = getInfoFromForm(form)
      if (!info) continue
      const diag = new vscode.Diagnostic(
        getFormInfoAsVSCodeRange(info),
        'type check: ' + printFormMessage(message),
        serverityToDiagnosticSeverity(severity),
      )
      diagnostics.push([infoToUri(info), [diag]])
    }
    diagnosticCollection.clear()
    diagnosticCollection.set(diagnostics)
  }
  context.subscriptions.push(
    diagnosticCollection,
    commands.registerCommand('wunslang.typecheck', async () => {
      try {
        await bindType()
      } catch (e) {
        console.error('type check threw error', e)
      }
    }),
  )
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  console.log('starting wuns lang extension: ' + context.extensionPath)

  const selector = { language: wunsLanguageId, scheme: 'file' }
  const documentSemanticTokensProvider = await makeProvideDocumentSemanticTokensForms()
  context.subscriptions.push(
    languages.registerDocumentSemanticTokensProvider(selector, documentSemanticTokensProvider, legend),
    languages.registerSelectionRangeProvider(selector, { provideSelectionRanges: await makeProvideSelectionRanges() }),
  )
  await addBindCheckActiveDocumentCommand(context)
  console.log('Congratulations, your extension "wunslang" is now active!')
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
