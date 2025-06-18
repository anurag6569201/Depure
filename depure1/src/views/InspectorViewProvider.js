const vscode = require('vscode');
// @ts-ignore
const { generateFileTree, getImportsFromUris, getDjangoSettingsContent } = require('../utils/workspaceParser');

class InspectorViewProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._view = null;
    }

    // @ts-ignore
    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this._updateView('<h2>Depure Django Inspector</h2><p>Right-click a folder in the explorer and select "Depure: Inspect Django Project" to begin.</p>');
    }

    async inspect(uris) {
        if (!this._view) {
            await vscode.commands.executeCommand('depureInspectorView.focus');
        }

        if (!this._view) {
            vscode.window.showErrorMessage('Could not find the Depure Inspector view.');
            return;
        }

        this._view.show(true);
        this._updateView('<h2>Inspecting...</h2><p>Gathering data from your selection.</p>');

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const rootUri = workspaceFolders ? workspaceFolders[0].uri : null;
            if (!rootUri) {
                throw new Error("Please open a workspace folder to inspect.");
            }

            // --- GATHER ALL THREE DATA SOURCES ---
            const fileTree = await generateFileTree(rootUri);
            const settingsInfo = await getDjangoSettingsContent(rootUri);
            const imports = await getImportsFromUris(uris);
            // ---

            const sortedImports = Array.from(imports).sort();

            const html = this.getHtmlContent(fileTree, sortedImports, settingsInfo);
            this._updateView(html);

        } catch (error) {
            this._updateView(`<h2>Error</h2><p>An error occurred during inspection: ${error.message}</p>`);
        }
    }

    _updateView(html) {
        if (this._view) {
            this._view.webview.html = html;
        }
    }

    getHtmlContent(fileTree, imports, settingsInfo) {
        const nonce = getNonce();
        const stylesUri = this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._view.webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${stylesUri}" rel="stylesheet">
    <title>Depure Inspector</title>
</head>
<body>
    <div class="container">
        <div class="panel">
            <div class="panel-header">
                <h2>Codebase Structure</h2>
                <button class="copy-btn" data-target="structure-content">Copy</button>
            </div>
            <textarea id="structure-content" readonly>${fileTree}</textarea>
        </div>
        <div class="panel">
            <div class="panel-header">
                <h2>Project Settings <small>(${settingsInfo.path})</small></h2>
                <button class="copy-btn" data-target="settings-content">Copy</button>
            </div>
            <textarea id="settings-content" readonly>${settingsInfo.content}</textarea>
        </div>
        <div class="panel">
            <div class="panel-header">
                <h2>Extracted Imports</h2>
                <button class="copy-btn" data-target="imports-content">Copy</button>
            </div>
            <textarea id="imports-content" readonly>${imports.join('\n')}</textarea>
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('.copy-btn').forEach(button => {
            button.addEventListener('click', event => {
                const targetId = event.currentTarget.dataset.target;
                const textarea = document.getElementById(targetId);
                textarea.select();
                document.execCommand('copy');
                
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 1500);
            });
        });
    </script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

module.exports = InspectorViewProvider;