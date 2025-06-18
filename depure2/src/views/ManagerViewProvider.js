const vscode = require('vscode');
const RequirementsManager = require('../services/RequirementsManager');
const { gatherDjangoKnowledge } = require('../utils/knowledgeBaseBuilder');
const logger = require('../utils/logger');

class ManagerViewProvider {
    constructor(context) {
        this._context = context;
        this._view = null;
        this.manager = new RequirementsManager();
        this.manager.setViewProvider(this);

        this.currentKnowledgeBase = null;
        this._uiState = 'welcome';
        this._editorContent = '';
        this._loadingText = 'Loading...';
    }

    resolveWebviewView(webviewView, _webviewContext, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };
        
        webviewView.webview.html = this._getHtmlForWebview();
        this.postMessage({ command: 'restoreState', state: this._uiState, content: this._editorContent, loadingText: this._loadingText });

        webviewView.onDidDispose(() => { this._view = null; });

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (!this.currentKnowledgeBase && !['alert'].includes(message.command)) {
                this.postMessage({ command: 'alert', text: 'Please start an analysis first by clicking the rocket icon in the title bar.' });
                return;
            }

            let result;
            try {
                this.setLoadingState(message.command, true);
                
                switch (message.command) {
                    case 'generate':
                        result = await this.manager.generate(this.currentKnowledgeBase);
                        break;
                    case 'fix':
                        result = await this.manager.fix(this.currentKnowledgeBase);
                        break;
                    case 'fill':
                        this._editorContent = message.currentContent;
                        result = await this.manager.fill(this.currentKnowledgeBase, this._editorContent);
                        break;
                    case 'export':
                        await this.manager.exportToFile(message.currentContent);
                        vscode.window.showInformationMessage('requirements.txt has been saved/updated.');
                        break;
                }

                if (result) {
                    this._editorContent = result;
                    this.postMessage({ command: 'updateEditor', content: this._editorContent });
                }

            } catch (error) {
                logger.error(error.message);
                vscode.window.showErrorMessage(`Depure Pro Error: ${error.message}`);
            } finally {
                this.setLoadingState(message.command, false);
            }
        });
    }

    async startAnalysis(rootUri) {
        if (!this._view) {
            await vscode.commands.executeCommand('depureProView.focus');
        }
        this.setUiState('loading', 'Building Django project knowledge base...');
        
        try {
            this.currentKnowledgeBase = await gatherDjangoKnowledge(rootUri);
            logger.logKnowledgeBase(this.currentKnowledgeBase);
            this._editorContent = '';
            this.setUiState('main');
        } catch (error) {
            logger.error(error.message);
            vscode.window.showErrorMessage(`Analysis Prep Error: ${error.message}`);
            this.setUiState('welcome');
        }
    }
    
    setUiState(state, loadingText = 'Loading...') {
        this._uiState = state;
        this._loadingText = loadingText;
        this.postMessage({ command: 'setState', state: this._uiState, loadingText: this._loadingText });
    }

    setLoadingState(buttonId, isLoading) {
         this.postMessage({ command: 'setButtonLoading', buttonId, isLoading });
    }

    postMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    _getHtmlForWebview() {
        const nonce = getNonce();
        const stylesUri = this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'styles.css'));
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._view.webview.cspSource}; script-src 'nonce-${nonce}';">
    <title>Depure Pro</title>
    <link href="${stylesUri}" rel="stylesheet">
</head>
<body>
    <div id="welcome-screen" class="screen">
        <h2>Depure Pro: Django Edition</h2>
        <p>Click the <span class="icon">🚀</span> icon in the title bar to analyze this Django project.</p>
    </div>

    <div id="loading-screen" class="screen hidden">
        <div class="loader"></div>
        <p id="loading-text">Loading...</p>
    </div>

    <div id="main-content" class="container hidden">
        <div class="actions">
            <button id="generate" data-label="1. Generate Requirements">1. Generate Requirements</button>
            <button id="fix" data-label="2. Fix & Version">2. Fix & Version</button>
            <button id="fill" data-label="3. Fill Missing">3. Fill Missing</button>
        </div>
        <div class="editor-container">
            <textarea id="requirements-editor" placeholder="Generated requirements will appear here..."></textarea>
        </div>
        <button id="export" class="export-btn" data-label="Export to requirements.txt">Export to requirements.txt</button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        const screens = {
            welcome: document.getElementById('welcome-screen'),
            loading: document.getElementById('loading-screen'),
            main: document.getElementById('main-content')
        };
        const loadingText = document.getElementById('loading-text');
        const editor = document.getElementById('requirements-editor');
        const buttons = {
            generate: document.getElementById('generate'),
            fix: document.getElementById('fix'),
            fill: document.getElementById('fill'),
            export: document.getElementById('export')
        };

        function showScreen(screenName) {
            Object.values(screens).forEach(s => s.classList.add('hidden'));
            if (screens[screenName]) {
                screens[screenName].classList.remove('hidden');
            }
        }
        
        function restoreState(state, content, text) {
            showScreen(state);
            editor.value = content || '';
            loadingText.textContent = text || 'Loading...';
        }

        function sendMessage(command) {
            vscode.postMessage({
                command: command,
                currentContent: editor.value
            });
        }

        Object.keys(buttons).forEach(key => {
            buttons[key].addEventListener('click', () => sendMessage(key));
        });
        
        function setButtonLoadingState(buttonId, isLoading) {
            const button = buttons[buttonId];
            if (button) {
                button.disabled = isLoading;
                if (isLoading) {
                    button.innerHTML = '<span class="button-loader"></span>';
                } else {
                    button.innerHTML = button.dataset.label || 'Action';
                }
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateEditor':
                    editor.value = message.content;
                    break;
                case 'setButtonLoading':
                    setButtonLoadingState(message.buttonId, message.isLoading);
                    break;
                case 'setState':
                    showScreen(message.state);
                    if(message.state === 'loading') {
                        loadingText.textContent = message.loadingText;
                    }
                    break;
                case 'restoreState':
                    restoreState(message.state, message.content, message.loadingText);
                    break;
                case 'updateLoadingText':
                     if (screens.loading && !screens.loading.classList.contains('hidden')) {
                        loadingText.textContent = message.text;
                     }
                    break;
            }
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

module.exports = ManagerViewProvider;