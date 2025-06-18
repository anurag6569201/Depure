const vscode = require('vscode');
const AnalysisController = require('./AnalysisController');
const DependencyDataProvider = require('./providers/DependencyDataProvider');
const { showDependencyDetails } = require('./views/DependencyDetailsView');
const PyPiService = require('./services/PyPiService');
const { generateRequirementsFile } = require('./utils/fileUtils');

function activate(context) {
    const dependencyDataProvider = new DependencyDataProvider(context);
    const pypiService = new PyPiService(context.globalState);
    const analysisController = new AnalysisController(context, dependencyDataProvider);

    const depureTreeView = vscode.window.createTreeView('depureSidebar', {
        treeDataProvider: dependencyDataProvider
    });
    
    context.subscriptions.push(depureTreeView);

    const registerCommand = (name, handler) => {
        context.subscriptions.push(vscode.commands.registerCommand(name, handler));
    };

    registerCommand('depure.analyze', async () => {
        await analysisController.startAnalysisFromQuickPick();
    });
    
    registerCommand('depure.analyzeSelected', async (uri, selectedUris) => {
        const uris = selectedUris || [uri];
        await analysisController.startAnalysis(uris);
    });

    registerCommand('depure.refresh', () => dependencyDataProvider.refresh());
    
    registerCommand('depure.showDetails', (item) => showDependencyDetails(item.dependency, pypiService, context));
    
    registerCommand('depure.updatePackage', (item) => {
        if (item && item.dependency && item.dependency.pypiData) {
            dependencyDataProvider.updateDependencyVersion(item.dependency.name, item.dependency.pypiData.version);
            vscode.window.showInformationMessage(`Updated ${item.dependency.name} to ${item.dependency.pypiData.version}. Save with 'Generate requirements.txt'.`);
        }
    });

    registerCommand('depure.updateAll', async () => {
        await dependencyDataProvider.updateAllDependencies();
        vscode.window.showInformationMessage(`All possible packages updated. Save with 'Generate requirements.txt'.`);
    });

    registerCommand('depure.viewOnPyPI', (item) => {
        if(item && item.dependency && item.dependency.pypiData) {
            vscode.env.openExternal(vscode.Uri.parse(item.dependency.pypiData.homePage || `https://pypi.org/project/${item.dependency.name}/`));
        }
    });

    registerCommand('depure.generateRequirements', async () => {
        await generateRequirementsFile(dependencyDataProvider.getDependencies());
    });
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};