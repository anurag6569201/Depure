// This script will be run within the webview itself
(function () {
    const vscode = acquireVsCodeApi();

    document.getElementById('select-file-btn').addEventListener('click', () => {
        vscode.postMessage({ command: 'selectFile' });
    });

    document.getElementById('select-folder-btn').addEventListener('click', () => {
        vscode.postMessage({ command: 'selectFolder' });
    });
    
    document.getElementById('select-django-btn').addEventListener('click', () => {
        vscode.postMessage({ command: 'selectDjango' });
    });

}());