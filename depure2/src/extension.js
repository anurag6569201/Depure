const vscode = require('vscode');
const ManagerViewProvider = require('./views/ManagerViewProvider');

function activate(context) {
    const provider = new ManagerViewProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "depureProView",
            provider
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('depure.analyzeDjangoProject', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showWarningMessage('Please open a Django project folder to start an analysis.');
                return;
            }
            provider.startAnalysis(workspaceFolders[0].uri);
        })
    );
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};