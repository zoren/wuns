const vscode = require('vscode')
const { SemanticTokensLegend, SemanticTokensBuilder, Position, Range, languages } = vscode

const tokenTypes = ['class', 'interface', 'enum', 'function', 'variable']
const tokenModifiers = ['declaration', 'definition', 'defaultLibrary', 'static', 'local']
const legend = new SemanticTokensLegend(tokenTypes, tokenModifiers)

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('starting wuns lang extension')
  {
    {
      const { commands, window } = vscode

      let disposable = commands.registerCommand('wunslang.helloWorld', function () {
        window.showInformationMessage('wuns [here] 007 [if [quote 32]]')
      })
      context.subscriptions.push(disposable)
    }
  }

  const provider = {
    provideDocumentSemanticTokens(_document) {
      const tokensBuilder = new SemanticTokensBuilder(legend)
      tokensBuilder.push(new Range(new Position(1, 1), new Position(1, 5)), 'variable', ['local'])
      return tokensBuilder.build()
    },
  }

  const selector = { language: 'wuns', scheme: 'file' }

  context.subscriptions.push(languages.registerDocumentSemanticTokensProvider(selector, provider, legend))
  console.log('Congratulations, your extension "wunslang" is now active!')
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
