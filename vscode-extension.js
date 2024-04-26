const vscode = require('vscode')

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('Congratulations, your extension "wunslang" is now active!')

  let disposable = vscode.commands.registerCommand('wunslang.helloWorld', function () {
    vscode.window.showInformationMessage('wuns [here] 007 [if [quote 32]]')
  })

  context.subscriptions.push(disposable)
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
