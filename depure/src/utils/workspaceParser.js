const vscode = require('vscode');
const path = require('path');
const { parsePythonImports } = require('./pythonUtils');

async function generateFileTree(rootUri) {
    const tree = [];
    const excludePatterns = vscode.workspace.getConfiguration('depure').get('analysis.excludePatterns', []);
    const allFiles = await vscode.workspace.findFiles('**/*', `{${excludePatterns.join(',')}}`);
    
    allFiles.forEach(fileUri => {
        const relativePath = path.relative(rootUri.fsPath, fileUri.fsPath).replace(/\\/g, '/');
        tree.push(relativePath);
    });
    
    return tree.sort().join('\n');
}

async function getImportsFromUris(uris) {
    const allImports = new Set();
    
    for (const uri of uris) {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.File && uri.path.endsWith('.py')) {
            await parseFile(uri, allImports);
        } else if (stat.type === vscode.FileType.Directory) {
            const filesInDir = await vscode.workspace.findFiles(new vscode.RelativePattern(uri, '**/*.py'));
            for (const fileUri of filesInDir) {
                await parseFile(fileUri, allImports);
            }
        }
    }
    
    return allImports;
}

async function parseFile(fileUri, importSet) {
    try {
        const contentBytes = await vscode.workspace.fs.readFile(fileUri);
        const content = Buffer.from(contentBytes).toString('utf8');
        const imports = parsePythonImports(content);
        imports.forEach(imp => importSet.add(imp));
    } catch (error) {
        console.warn(`Could not read or parse ${fileUri.fsPath}: ${error.message}`);
    }
}


module.exports = {
    generateFileTree,
    getImportsFromUris
};