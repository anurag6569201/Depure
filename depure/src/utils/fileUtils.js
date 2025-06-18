const vscode = require('vscode');
const path = require('path');
const { generateRequirementsContent } = require('./pythonUtils');

async function writeRequirementsFile(dependencies, outputPath) {
    const prodDeps = dependencies.filter(d => !d.isDev);
    const devDeps = dependencies.filter(d => d.isDev);

    await writeSingleReqFile(prodDeps, outputPath);

    if (devDeps.length > 0) {
        const devPath = path.join(path.dirname(outputPath), 'requirements-dev.txt');
        await writeSingleReqFile(devDeps, devPath);
        vscode.window.showInformationMessage(`Generated requirements.txt and requirements-dev.txt`);
    } else {
        vscode.window.showInformationMessage(`Generated requirements.txt`);
    }

    const doc = await vscode.workspace.openTextDocument(outputPath);
    await vscode.window.showTextDocument(doc);
}

async function writeSingleReqFile(dependencies, filePath) {
    const content = generateRequirementsContent(dependencies);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content));
}

async function generateRequirementsFile(dependencies) {
     const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder found to save requirements file.');
        return;
    }

    const requirementsPath = path.join(workspaceFolders[0].uri.fsPath, 'requirements.txt');
    
    await writeRequirementsFile(dependencies, requirementsPath);
}

module.exports = {
    generateRequirementsFile
};