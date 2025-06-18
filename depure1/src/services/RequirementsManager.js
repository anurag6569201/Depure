const vscode = require('vscode');
const AIClient = require('./AIClient');
const PyPiVerifier = require('./PyPiVerifier');
const logger =require('../utils/logger');

class RequirementsManager {
    constructor() {
        this.aiClient = new AIClient();
        this.pypiVerifier = new PyPiVerifier();
        this.viewProvider = null;
    }

    setViewProvider(viewProvider) {
        this.viewProvider = viewProvider;
    }

    _postStatus(text) {
        if (this.viewProvider) {
            this.viewProvider.postMessage({ command: 'updateLoadingText', text });
        }
    }

    _buildFrameworkContextPrompt(frameworkContext) {
        if (frameworkContext.type === 'Generic' || frameworkContext.files.length === 0) {
            return '<framework_context>Project type is generic.</framework_context>';
        }
        let promptSection = `<framework_context type="${frameworkContext.type}">`;
        for (const file of frameworkContext.files) {
            promptSection += `<file name="${file.name}">${file.content}</file>`;
        }
        promptSection += `</framework_context>`;
        return promptSection;
    }

    // THIS IS THE MAIN FIX: The logic for getting candidates is now robust.
    async _getFinalRequirements(context, instructionPrompt) {
        this._postStatus('Stage 1: Parsing imports and searching PyPI...');
        
        // Use a robust function to get searchable module names.
        const baseImports = this.parseBaseImports(context.allImports);
        logger.log(`Robustly parsed base import candidates: ${JSON.stringify(Array.from(baseImports))}`);

        // The deterministic, PyPI-first pipeline
        const resolvedPackagesMap = await this.pypiVerifier.resolveDependencies(Array.from(baseImports));
        const resolvedPackages = Array.from(resolvedPackagesMap.values());
        
        logger.log(`Final resolved package list before AI: ${JSON.stringify(resolvedPackages, null, 2)}`);

        if (resolvedPackages.length === 0) {
            throw new Error("PyPI verification failed to find any valid packages. This might be due to network issues or highly unconventional import names.");
        }

        this._postStatus('Stage 2: AI assembling final requirements file...');
        const { frameworkContext } = context;
        const frameworkPrompt = this._buildFrameworkContextPrompt(frameworkContext);

        const finalPrompt = `
You are a Python dependency file assembler. Your task is to create a perfect 'requirements.txt' file from a pre-verified list of packages.

**Project Framework Context:**
${frameworkPrompt}

**Verified Package List:**
I have deterministically resolved all direct and transitive dependencies for this project. This is the complete, verified list of required packages, their canonical names, and latest versions.
<verified_packages>
${JSON.stringify(resolvedPackages, null, 2)}
</verified_packages>

**Your Task & Instructions:**
${instructionPrompt}

Respond ONLY with the final plain text content for the requirements.txt file, sorted alphabetically.`;
        
        return await this.aiClient.query(finalPrompt);
    }
    
    // NEW, ROBUST PARSING FUNCTION
    parseBaseImports(fullImportLines) {
        const baseImports = new Set();
        const importRegex = /^(?:from\s+([\w.]+)|import\s+([\w., ]+))/;

        for (const line of fullImportLines) {
            const match = line.trim().match(importRegex);
            if (match) {
                // Handles 'from X.Y import Z' -- we want 'X'
                if (match[1]) {
                    baseImports.add(match[1].split('.')[0]);
                } 
                // Handles 'import X, Y, Z'
                else if (match[2]) {
                    const modules = match[2].split(',');
                    for (const mod of modules) {
                        // Takes the first part of 'X as Y'
                        const cleanMod = mod.trim().split(/\s+/)[0];
                        // Takes the first part of 'X.Y.Z'
                        baseImports.add(cleanMod.split('.')[0]);
                    }
                }
            }
        }
        return baseImports;
    }
    
    // --- The rest of the functions (generate, fix, fill, etc.) are now simpler ---
    // They just define the final instruction for the AI.

    async generate(context) {
        const instruction = `
1.  Review the <verified_packages> list. It is the source of truth.
2.  Add 'gunicorn' to the list if the project type is Django, Flask, or FastAPI, as it's a standard production server.
3.  Create the final 'requirements.txt' containing all necessary packages from the verified list.
4.  Do NOT include version numbers.`;
        return await this._getFinalRequirements(context, instruction);
    }

    async fix(context) {
        const instruction = `
1.  Review the <verified_packages> list. It is the source of truth.
2.  Add 'gunicorn' to the list if the project type is Django, Flask, or FastAPI.
3.  Create the final 'requirements.txt' containing all necessary packages from the verified list.
4.  For each package, use its 'name' and 'version' from the verified list to format it as 'package-name==version'.`;
        return await this._getFinalRequirements(context, instruction);
    }

    async fill(context, currentRequirements) {
        if (!currentRequirements.trim()) {
            return this.generate(context);
        }
        
        const instruction = `
1.  Review the <verified_packages> list. This is the complete list of what the project needs.
2.  Add 'gunicorn' to the list if the project type is Django, Flask, or FastAPI.
3.  Compare your complete list against the user's current requirements file provided below.
4.  Create a new, final list that contains all packages from the user's list PLUS any you identified that were missing.
5.  Do NOT include version numbers.

**User's Current requirements.txt:**
<current_requirements>
${currentRequirements}
</current_requirements>`;
        return await this._getFinalRequirements(context, instruction);
    }

    async exportToFile(content) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) throw new Error("No workspace folder is open.");

        const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, 'requirements.txt');
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(content, 'utf8'));

        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
    }
}

module.exports = RequirementsManager;