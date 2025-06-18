const vscode = require('vscode');
const path = require('path');
const AIAnalyzer = require('./services/AIAnalyzer');
const PyPiService = require('./services/PyPiService');
const { generateFileTree, getImportsFromUris } = require('./utils/workspaceParser');

class AnalysisController {
    constructor(context, dataProvider) {
        this.context = context;
        this.dataProvider = dataProvider;
        this.pypiService = new PyPiService(context.globalState);
        this.aiAnalyzer = new AIAnalyzer();
    }

    async startAnalysisFromQuickPick() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Please open a folder to analyze.');
            return;
        }
        const rootUri = workspaceFolders[0].uri;

        const allFilesAndFolders = await this.getAllWorkspaceItems(rootUri);
        
        const selectedItems = await vscode.window.showQuickPick(allFilesAndFolders, {
            canPickMany: true,
            placeHolder: 'Select files and folders to analyze (or press Esc for whole workspace)',
        });

        // If user presses Esc or selects nothing, analyze the whole workspace
        const urisToAnalyze = (selectedItems && selectedItems.length > 0) 
            ? selectedItems.map(item => item.uri) 
            : [rootUri];
        
        await this.startAnalysis(urisToAnalyze);
    }

    async startAnalysis(uris) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;
        const workspaceRoot = workspaceFolders[0].uri;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Depure: Analyzing Dependencies',
            cancellable: true,
        }, async (progress, token) => {
            try {
                progress.report({ message: 'Building file structure...' });
                const fileTree = await generateFileTree(workspaceRoot);
                if (token.isCancellationRequested) return;

                progress.report({ message: 'Extracting imports...' });
                const imports = await getImportsFromUris(uris);
                if (token.isCancellationRequested) return;

                if (imports.size === 0) {
                    vscode.window.showInformationMessage('Depure: No Python imports found in the selected scope.');
                    this.dataProvider.setDependencies([]);
                    return;
                }
                
                progress.report({ message: 'Asking AI to resolve dependencies...' });
                const aiResponse = await this.aiAnalyzer.resolveDependencies(fileTree, Array.from(imports));
                if (token.isCancellationRequested) return;

                let dependencies = aiResponse.dependencies || [];
                
                progress.report({ message: 'Validating packages with PyPI...' });
                dependencies = await this.validateDependencies(dependencies, progress, token);

                this.dataProvider.setDependencies(dependencies);
                vscode.window.showInformationMessage(`Analysis complete. Found ${dependencies.length} external packages.`);

            } catch (error) {
                if (error.message !== 'Cancelled') {
                    vscode.window.showErrorMessage(`Depure Analysis Error: ${error.message}`);
                }
            }
        });
    }

    async getAllWorkspaceItems(rootUri) {
        const excludePatterns = vscode.workspace.getConfiguration('depure').get('analysis.excludePatterns', []);
        const allUris = await vscode.workspace.findFiles('**/*', vscode.Uri.joinPath(rootUri, `{${excludePatterns.join(',')}}`));
        
        return allUris.map(uri => ({
            label: `$(file) ${path.relative(rootUri.fsPath, uri.fsPath)}`,
            uri: uri
        }));
    }

    async validateDependencies(dependencies, progress, token) {
        const total = dependencies.length;
        const validatedDeps = [];

        for (const [index, dep] of dependencies.entries()) {
            if (token.isCancellationRequested) throw new Error('Cancelled');
            progress.report({ message: `Validating: ${dep.name}`, increment: (1 / total) * 100 });
            
            const pypiInfo = await this.pypiService.getPackageInfo(dep.name);
            if (pypiInfo) {
                validatedDeps.push({
                    ...dep,
                    version: pypiInfo.version,
                    description: pypiInfo.summary || dep.description,
                    pypiData: pypiInfo,
                    isValid: true
                });
            }
        }
        return validatedDeps;
    }
}

module.exports = AnalysisController;