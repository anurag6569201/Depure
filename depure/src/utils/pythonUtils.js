const fs = require('fs/promises');
const path = require('path');

const STANDARD_LIBS = new Set([
    'os', 'sys', 'math', 'datetime', 'json', 're', 'random', 'pathlib',
    'subprocess', 'collections', 'itertools', 'functools', 'typing',
    'argparse', 'logging', 'unittest', 'threading', 'multiprocessing',
    'csv', 'hashlib', 'ssl', 'socket', 'urllib', 'http', 'email', 'asyncio'
]);

function isStandardLib(moduleName) {
    const baseModule = moduleName.split('.')[0];
    return STANDARD_LIBS.has(baseModule);
}

function parsePythonImports(content) {
    const importRegex = /^(?:from\s+([\w.]+)\s+import|import\s+([\w., ]+))/gm;
    const imports = new Set();
    let match;

    while ((match = importRegex.exec(content)) !== null) {
        const modules = match[1] || match[2];
        modules.split(',').forEach(imp => {
            const cleanImp = imp.trim().split(/ as /)[0].trim();
            if (cleanImp) {
                const baseModule = cleanImp.split('.')[0];
                if (baseModule && !baseModule.startsWith('.')) { // Ignore relative imports here
                    imports.add(baseModule);
                }
            }
        });
    }
    return Array.from(imports);
}

// --- NEW, SMARTER LOGIC TO FIND LOCAL MODULES ---
async function findLocalModules(workspaceRoot) {
    const localModules = new Set();
    try {
        const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
        for (const entry of entries) {
            // It's a local module if it's a directory with an __init__.py...
            if (entry.isDirectory()) {
                try {
                    await fs.access(path.join(workspaceRoot, entry.name, '__init__.py'));
                    localModules.add(entry.name);
                } catch (e) {
                    // Not a package, might be a regular directory
                }
            } 
            // ...or if it's a .py file.
            else if (entry.isFile() && entry.name.endsWith('.py')) {
                localModules.add(entry.name.slice(0, -3));
            }
        }
    } catch (error) {
        console.error('Error discovering local modules:', error);
    }
    // Also add the project directory name itself if it contains manage.py (a Django project)
    if ((await fs.readdir(workspaceRoot)).includes('manage.py')) {
        const projectName = path.basename(workspaceRoot);
        localModules.add(projectName);
    }
    return localModules;
}
// --- END OF NEW LOGIC ---

function generateRequirementsContent(dependencies) {
    return dependencies
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(dep => `${dep.name}==${dep.version}`)
        .join('\n') + '\n';
}

module.exports = {
    isStandardLib,
    parsePythonImports,
    generateRequirementsContent,
    findLocalModules // Export the new function
};