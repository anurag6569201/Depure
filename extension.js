const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
    const provider = new DepureViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DepureViewProvider.viewType, provider)
    );
}

class DepureViewProvider {
    static viewType = 'depureView';

    constructor(extensionUri) {
        this._extensionUri = extensionUri;
    }

    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;

        webviewView.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview')]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // This is where we will listen for messages from the UI
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'selectFile':
                    vscode.window.showInformationMessage('Select File button clicked!');
                    // We will add the file selection logic here in the next iteration.
                    return;
                case 'selectFolder':
                    vscode.window.showInformationMessage('Select Folder button clicked!');
                    // We will add the folder selection logic here in the next iteration.
                    return;
                case 'selectDjango':
                    vscode.window.showInformationMessage('Select Django Project button clicked!');
                    // We will add the project selection logic here in the next iteration.
                    return;
            }
        });
    }

    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'style.css'));

        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'webview', 'sidebar.html');
        let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');

        // Replace placeholders with the correct URIs
        htmlContent = htmlContent.replace('{{styleUri}}', styleUri).replace('{{scriptUri}}', scriptUri);
        
        return htmlContent;
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};