const vscode = require('vscode');

async function gatherProjectContext(uris) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) throw new Error("A workspace folder must be open.");
    
    const rootUri = workspaceFolders[0].uri;
    
    const [fileTree, allImports, frameworkContext] = await Promise.all([
        generateFileTree(rootUri),
        getImportsFromUris(uris),
        detectAndGetFrameworkContext(rootUri)
    ]);
    
    return { 
        fileTree, 
        allImports: Array.from(allImports),
        frameworkContext
    };
}

async function detectAndGetFrameworkContext(rootUri) {
    const context = {
        type: 'Generic',
        files: []
    };

    try {
        const managePyUri = vscode.Uri.joinPath(rootUri, 'manage.py');
        await vscode.workspace.fs.stat(managePyUri);
        context.type = 'Django';
        
        const settingsModulePath = await parseManagePyForSettings(managePyUri);
        if (settingsModulePath) {
            const settingsFilePath = settingsModulePath.replace(/\./g, '/') + '.py';
            const settingsFileUri = vscode.Uri.joinPath(rootUri, settingsFilePath);
            context.files.push({
                name: vscode.workspace.asRelativePath(settingsFileUri),
                content: await readFileContent(settingsFileUri)
            });
        }
        return context;
    } catch (e) { /* Not a Django project */ }
    
    const pythonFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(rootUri, '{app,main}.py'));
    for (const fileUri of pythonFiles) {
        const content = await readFileContent(fileUri);
        if (content.includes('Flask(__name__)')) {
            context.type = 'Flask';
            context.files.push({ name: vscode.workspace.asRelativePath(fileUri), content });
            return context;
        }
        if (content.includes('FastAPI()')) {
            context.type = 'FastAPI';
            context.files.push({ name: vscode.workspace.asRelativePath(fileUri), content });
            return context;
        }
    }

    return context;
}

async function parseManagePyForSettings(managePyUri) {
    const content = await readFileContent(managePyUri);
    const match = content.match(/os\.environ\.setdefault\(\s*['"]DJANGO_SETTINGS_MODULE['"]\s*,\s*['"]([\w.]+)['"]\s*\)/);
    return match ? match[1] : null;
}

async function generateFileTree(rootUri) {
    const excludePatterns = vscode.workspace.getConfiguration('depure.pro').get('excludePatterns', []);
    const excludePattern = `{${excludePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/*', excludePattern);
    return files.map(uri => vscode.workspace.asRelativePath(uri)).sort().join('\n');
}

async function getImportsFromUris(uris) {
    const allImports = new Set();
    const excludePatterns = vscode.workspace.getConfiguration('depure.pro').get('excludePatterns', []);
    const excludePattern = `{${excludePatterns.join(',')}}`;

    for (const uri of uris) {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.File && uri.path.endsWith('.py')) {
            await parseFileAndAddImports(uri, allImports);
        } else if (stat.type === vscode.FileType.Directory) {
            const pattern = new vscode.RelativePattern(uri, '**/*.py');
            const filesInDir = await vscode.workspace.findFiles(pattern, excludePattern);
            for (const fileUri of filesInDir) {
                await parseFileAndAddImports(fileUri, allImports);
            }
        }
    }
    return allImports;
}

async function parseFileAndAddImports(fileUri, importSet) {
    try {
        const content = await readFileContent(fileUri);
        const imports = parsePythonImports(content);
        imports.forEach(imp => importSet.add(imp));
    } catch (error) {
        console.warn(`Could not parse ${fileUri.fsPath}: ${error.message}`);
    }
}

function parsePythonImports(content) {
    const importRegex = /^(?:from .*|import .*)$/gm;
    const imports = new Set();
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        const trimmedLine = match[0].trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            imports.add(trimmedLine);
        }
    }
    return Array.from(imports);
}

async function readFileContent(uri) {
    try {
        const contentBytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(contentBytes).toString('utf8');
    } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
            return `File not found: ${vscode.workspace.asRelativePath(uri)}`;
        }
        return `Error reading file: ${error.message}`;
    }
}

module.exports = { gatherProjectContext };