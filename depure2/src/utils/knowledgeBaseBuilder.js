const vscode = require('vscode');

async function gatherDjangoKnowledge(rootUri) {
    // --- THIS IS THE FIX ---
    // Initialize the knowledgeBase with a complete, predictable structure.
    const knowledgeBase = {
        candidates: new Set(),
        localSymbols: new Set(),
        allImports: [],
        fileTree: '',
        framework: { 
            type: 'Generic', 
            details: [] // Ensure 'details' is always an array
        }
    };
    // --- END OF FIX ---
    
    const excludePatterns = vscode.workspace.getConfiguration('depure.pro').get('excludePatterns', []);
    const excludePattern = `{${excludePatterns.join(',')}}`;
    
    // 1. Get file tree
    const allFiles = await vscode.workspace.findFiles('**/*', excludePattern);
    knowledgeBase.fileTree = allFiles.map(uri => vscode.workspace.asRelativePath(uri)).sort().join('\n');

    // 2. Confirm it's a Django project and get settings
    try {
        const managePyUri = vscode.Uri.joinPath(rootUri, 'manage.py');
        await vscode.workspace.fs.stat(managePyUri);
        knowledgeBase.framework.type = 'Django';

        const settingsModulePath = await parseManagePyForSettings(managePyUri);
        if (settingsModulePath) {
             const settingsFileUri = vscode.Uri.joinPath(rootUri, settingsModulePath.replace(/\./g, '/') + '.py');
             const settingsContent = await readFileContent(settingsFileUri);
             
             if(settingsContent.startsWith('File not found') || settingsContent.startsWith('Error reading file')) {
                knowledgeBase.framework.details.push(`settings.py content: ${settingsContent}`);
             } else {
                const appsMatch = settingsContent.match(/INSTALLED_APPS\s*=\s*\[([^\]]+)\]/m);
                if (appsMatch) {
                    const appsDetails = `INSTALLED_APPS: ${appsMatch[1].replace(/\s/g, '')}`;
                    knowledgeBase.framework.details.push(appsDetails);
                    appsMatch[1].split(',').forEach(app => {
                        const cleanApp = app.trim().replace(/['",]/g, '').split('.')[0];
                        if(cleanApp && !cleanApp.startsWith('django.')) knowledgeBase.candidates.add(cleanApp);
                    });
                }
             }
        }
    } catch (e) {
        throw new Error("This does not appear to be a Django project. `manage.py` was not found in the workspace root.");
    }
    
    // 3. Scan all python files for imports and symbols
    const filesToParse = await vscode.workspace.findFiles(new vscode.RelativePattern(rootUri, '**/*.py'), excludePattern);

    const classRegex = /^\s*class\s+([A-Za-z_]\w*)/;
    const funcRegex = /^\s*def\s+([A-Za-z_]\w*)/;
    const importRegex = /^(?:from\s+([\w.]+)|import\s+([\w., ]+))/;
    const allImportsSet = new Set();

    for (const fileUri of filesToParse) {
        const content = await readFileContent(fileUri);
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) continue;

            let match;
            if ((match = trimmedLine.match(classRegex))) {
                knowledgeBase.localSymbols.add(match[1]);
            } else if ((match = trimmedLine.match(funcRegex))) {
                knowledgeBase.localSymbols.add(match[1]);
            } else if ((match = trimmedLine.match(importRegex))) {
                allImportsSet.add(trimmedLine);
                if (match[1]) {
                    const baseModule = match[1].split('.')[0];
                    if (baseModule) knowledgeBase.candidates.add(baseModule);
                } else if (match[2]) {
                    match[2].split(',').forEach(mod => {
                        const cleanMod = mod.trim().split(/\s+/)[0].split('.')[0];
                        if (cleanMod) knowledgeBase.candidates.add(cleanMod);
                    });
                }
            }
        }
    }
    knowledgeBase.allImports = Array.from(allImportsSet);

    // 4. Clean up candidates
    const projectDirs = new Set();
    const initFiles = await vscode.workspace.findFiles('*/__init__.py', excludePattern);
    initFiles.forEach(file => {
        const parts = file.path.split('/');
        if (parts.length > 1) {
            projectDirs.add(parts[parts.length - 2]);
        }
    });
    projectDirs.forEach(dir => knowledgeBase.candidates.delete(dir));
    
    getStdLib().forEach(lib => knowledgeBase.candidates.delete(lib));
    knowledgeBase.candidates.delete('');

    return knowledgeBase;
}

// --- Helper Functions ---
async function readFileContent(uri) {
    try {
        const contentBytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(contentBytes).toString('utf8');
    } catch (error) {
        if (error instanceof vscode.FileSystemError) return `File not found: ${vscode.workspace.asRelativePath(uri)}`;
        return `Error reading file: ${error.message}`;
    }
}

async function parseManagePyForSettings(managePyUri) {
    const content = await readFileContent(managePyUri);
    const match = content.match(/os\.environ\.setdefault\(\s*['"]DJANGO_SETTINGS_MODULE['"]\s*,\s*['"]([\w.]+)['"]\s*\)/);
    return match ? match[1] : null;
}

function getStdLib() { 
    return new Set(['os', 'sys', 'json', 're', 'datetime', 'pathlib', 'logging', 'unittest', 'typing', 'enum', 'collections', 'itertools', 'functools', 'subprocess', 'math', 'random', 'uuid', 'http', 'urllib', 'csv', 'hashlib', 'ssl', 'socket', 'threading', 'multiprocessing', 'argparse']);
}

module.exports = { gatherDjangoKnowledge };