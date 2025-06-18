const vscode = require('vscode');
const { isStandardLib } = require('../utils/pythonUtils');

class GutterDecorator {
    constructor(dataProvider) {
        this.dataProvider = dataProvider;
        
        this.decorationTypes = {
            ok: vscode.window.createTextEditorDecorationType({
                gutterIconPath: new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed')).id,
                gutterIconSize: 'contain'
            }),
            update: vscode.window.createTextEditorDecorationType({
                gutterIconPath: new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('testing.iconQueued')).id,
                gutterIconSize: 'contain'
            }),
            missing: vscode.window.createTextEditorDecorationType({
                gutterIconPath: new vscode.ThemeIcon('question', new vscode.ThemeColor('testing.iconSkipped')).id,
                gutterIconSize: 'contain'
            })
        };
    }

    updateDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'python') {
            return;
        }

        const text = editor.document.getText();
        const importRegex = /^(?:from\s+([\w.]+)\s+import|import\s+([\w., ]+))/gm;
        
        const decorations = { ok: [], update: [], missing: [] };
        let match;

        while ((match = importRegex.exec(text)) !== null) {
            const line = editor.document.lineAt(editor.document.positionAt(match.index).line);
            
            const imports = (match[1] || match[2]).split(',').map(i => i.trim().split('.')[0]);

            for (const imp of imports) {
                if (isStandardLib(imp) || imp.startsWith('.')) {
                    continue;
                }
                
                const dep = this.dataProvider.getDependency(imp.replace(/_/g, '-'));
                
                let hoverMessage;
                let status;

                if (dep) {
                    if (dep.updateAvailable) {
                        status = 'update';
                        hoverMessage = new vscode.MarkdownString(`**${dep.name}**: Update available (v${dep.pypiData.version})`);
                    } else {
                        status = 'ok';
                        hoverMessage = new vscode.MarkdownString(`**${dep.name}**: v${dep.version} (Managed by Depure)`);
                    }
                } else {
                    status = 'missing';
                    hoverMessage = new vscode.MarkdownString(`**${imp}**: Not found in analysis. Re-analyze to include.`);
                }
                
                decorations[status].push({ range: line.range, hoverMessage });
            }
        }
        
        Object.keys(this.decorationTypes).forEach(key => {
            editor.setDecorations(this.decorationTypes[key], decorations[key]);
        });
    }
}

module.exports = GutterDecorator;