const vscode = require('vscode');
const AIClient = require('./AIClient');
const logger = require('../utils/logger');

class RequirementsManager {
    constructor() {
        this.aiClient = new AIClient();
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

    // This is the single, streamlined pipeline
    async _getFinalRequirements(knowledgeBase, instructionPrompt) {
        this._postStatus('AI analyzing project for top-level dependencies...');
        const { framework, localSymbols, allImports } = knowledgeBase;

        const finalPrompt = `
You are a senior Python developer tasked with creating a clean, production-focused 'requirements.txt' file.
Your job is to identify ONLY the direct, top-level libraries required to run this application.

**Analysis Rules & Context:**
1.  **Framework:** The project is a '${framework.type}' application. Key settings are: ${framework.details.join(', ')}
2.  **Imports:** The project uses these import statements: ${allImports.join(', ')}
3.  **Local Code:** The project defines these local symbols, which are NOT external packages: ${Array.from(localSymbols).join(', ')}

**Your ONLY Task:**
${instructionPrompt}

Respond with a plain text list, one package per line, sorted alphabetically.`;
        
        const result = await this.aiClient.query(finalPrompt);
        logger.log('Final AI-generated requirements:', result);
        this._postStatus('Analysis complete.');
        return result;
    }
    
    async generate(knowledgeBase) {
        const instruction = `
Based on the context, list the canonical PyPI names for the direct, top-level application dependencies.
-   You MUST map import names and INSTALLED_APPS to their correct PyPI package names (e.g., 'rest_framework' -> 'djangorestframework', 'corsheaders' -> 'django-cors-headers').
-   You MUST include 'gunicorn' as it is the standard production web server.
-   You MUST NOT include any transitive dependencies (e.g., asgiref, sqlparse, PyJWT, packaging).
-   You MUST NOT include any development tools (e.g., pytest, black, mypy, ruff, sphinx).
-   Do NOT include version numbers.`;
        return await this._getFinalRequirements(knowledgeBase, instruction);
    }

    async fix(knowledgeBase) {
        const instruction = `
Based on the context, create a list of the true, top-level application dependencies with their latest stable versions.
-   Follow all the rules from the 'generate' task (map to canonical names, include gunicorn, exclude transitive/dev dependencies).
-   For each package in your final, correct list, append its latest stable version number (e.g., 'Django==5.2.1').`;
        return await this._getFinalRequirements(knowledgeBase, instruction);
    }

    async fill(knowledgeBase, currentRequirements) {
        if (!currentRequirements.trim()) {
            return this.generate(knowledgeBase);
        }
        
        const instruction = `
1.  First, determine the true, complete list of required top-level packages by following all the rules from the 'generate' task.
2.  Compare your complete list against the user's current requirements file provided below.
3.  Create a new, final list that contains all unique packages from the user's list PLUS any you identified that were missing.
4.  Do NOT include version numbers.

<current_requirements>
${currentRequirements}
</current_requirements>`;
        return await this._getFinalRequirements(knowledgeBase, instruction);
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