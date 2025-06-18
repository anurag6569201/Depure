const vscode = require('vscode');
const logger = require('../utils/logger');

class AnalysisController {
    constructor(viewProvider) {
        this.viewProvider = viewProvider;
    }

    async showAnalysisOptions() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Please open a workspace folder to start an analysis.');
            return;
        }
        const rootUri = workspaceFolders[0].uri;

        const options = [
            { label: 'Analyze Entire Workspace', description: 'Automatically detects framework (Django, Flask, etc.)', type: 'workspace' },
            { label: 'Select Files/Folders to Analyze...', description: 'Choose specific items for a focused analysis', type: 'select' }
        ];

        const selection = await vscode.window.showQuickPick(options, {
            placeHolder: 'Choose an analysis scope for Depure Pro',
        });

        if (!selection) return;

        let analysisUris = [];

        if (selection.type === 'workspace') {
            analysisUris = [rootUri];
        } else if (selection.type === 'select') {
            const allItems = await this.getAllWorkspaceItems(rootUri);
            const selectedItems = await vscode.window.showQuickPick(allItems, {
                canPickMany: true,
                placeHolder: 'Select files and folders to analyze',
            });
            if (!selectedItems || selectedItems.length === 0) return;
            analysisUris = selectedItems.map(item => item.uri);
        }
        
        if (analysisUris.length > 0) {
            logger.log(`Starting analysis with scope: ${selection.label}`);
            this.viewProvider.startAnalysis(analysisUris);
        }
    }
    
    async getAllWorkspaceItems(rootUri) {
        const excludePatterns = vscode.workspace.getConfiguration('depure.pro').get('excludePatterns', []);
        const excludePattern = `{${excludePatterns.join(',')}}`;
        const allUris = await vscode.workspace.findFiles('**/*', excludePattern);
        
        return allUris.map(uri => ({
            label: `$(file) ${vscode.workspace.asRelativePath(uri)}`,
            uri: uri
        }));
    }
}

module.exports = AnalysisController;