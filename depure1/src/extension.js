const vscode = require('vscode');
const ManagerViewProvider = require('./views/ManagerViewProvider');
const AnalysisController = require('./controllers/AnalysisController');

function activate(context) {
    const provider = new ManagerViewProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "depureProView",
            provider
        )
    );

    const analysisController = new AnalysisController(provider);

    context.subscriptions.push(
        vscode.commands.registerCommand('depure.startAnalysis', async () => {
            await analysisController.showAnalysisOptions();
        })
    );
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};