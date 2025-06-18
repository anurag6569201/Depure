const axios = require('axios');
const vscode = require('vscode');

class AIAnalyzer {
    async resolveDependencies(fileTree, imports) {
        const config = vscode.workspace.getConfiguration('depure.llm');
        const apiKey = config.get('apiKey');
        const model = config.get('model');
        let endpoint = config.get('endpoint');

        if (!apiKey) {
            throw new Error('Google AI API key (depure.llm.apiKey) is not configured.');
        }

        endpoint = `${endpoint}/${model}:generateContent?key=${apiKey}`;

        try {
            const prompt = this.buildPrompt(fileTree, imports);
            const requestBody = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 4096,
                    responseMimeType: "application/json",
                }
            };

            const response = await axios.post(endpoint, requestBody, {
                headers: { 'Content-Type': 'application/json' }
            });
            
            const content = response.data.candidates[0]?.content?.parts[0]?.text;
            if (!content) {
                throw new Error('Received an empty response from the Gemini service.');
            }
            return this.parseAIResponse(content);
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            throw new Error(`Gemini Service Error: ${errorMsg}`);
        }
    }

    buildPrompt(fileTree, imports) {
        return `
You are an expert Python dependency analysis engine. Your task is to distinguish between local modules and external, installable PyPI packages.

Here is the complete file and folder structure of the user's project:
\`\`\`
${fileTree}
\`\`\`

Here is a list of all unique import statements found in the user's selected code:
\`\`\`
${imports.join('\n')}
\`\`\`

Based on the provided file structure, identify which of these imports correspond to **external PyPI packages**. Ignore any imports that are part of Python's standard library or that resolve to a file or folder within the project structure.

Your response must be a valid JSON object with a single root key "dependencies". This key's value must be an array of objects. Each object represents a single external dependency and must have two keys:
1. "name": The official, lowercased PyPI package name (e.g., "beautifulsoup4" for an import of "bs4").
2. "isDev": A boolean, true if it's a development-only package (like pytest, black, mypy, flake8), otherwise false.

Example: If the structure contains 'my_utils/helpers.py' and an import is 'from my_utils import helpers', you must recognize 'my_utils' as a local module and exclude it from the final JSON. If an import is 'import requests', and 'requests' is not in the file structure, you must identify it as an external package.

Provide only the JSON object in your response.`;
    }

    parseAIResponse(content) {
        try {
            const result = JSON.parse(content);
            if (!result.dependencies || !Array.isArray(result.dependencies)) {
                throw new Error('AI response is missing the "dependencies" array.');
            }
            
            return {
                dependencies: result.dependencies.map(dep => ({
                    name: (dep.name || '').toLowerCase().trim().replace(/_/g, '-'),
                    isDev: !!dep.isDev,
                })).filter(dep => dep.name)
            };
        } catch (error) {
            throw new Error(`Failed to parse AI response: ${error.message}. Response was: ${content}`);
        }
    }
}

module.exports = AIAnalyzer;