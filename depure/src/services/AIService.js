const axios = require('axios');
const vscode = require('vscode');

class AIService {
    async analyzeImports(imports) {
        const config = vscode.workspace.getConfiguration('depure.llm');
        const apiKey = config.get('apiKey');
        const model = config.get('model');
        let endpoint = config.get('endpoint');

        if (!apiKey) {
            throw new Error('Google AI API key (depure.llm.apiKey) is not configured. Please get a key from Google AI Studio and add it to your settings.');
        }
        if (imports.length === 0) {
            return { dependencies: [] };
        }
        
        // Append the API key as a query parameter for Gemini's REST API
        endpoint = `${endpoint}/${model}:generateContent?key=${apiKey}`;

        try {
            const prompt = this.buildPrompt(imports);
            const requestBody = {
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2048,
                    responseMimeType: "application/json",
                }
            };

            const response = await axios.post(endpoint, requestBody, {
                headers: { 'Content-Type': 'application/json' }
            });
            
            const content = response.data.candidates[0]?.content?.parts[0]?.text;
            if (!content) {
                throw new Error('Received an empty or invalid response from the Gemini service.');
            }
            return this.parseAIResponse(content);
        } catch (error) {
            if (error.response && error.response.data && error.response.data.error) {
                const err = error.response.data.error;
                throw new Error(`Gemini Service Error (${err.code}): ${err.message}`);
            }
            throw new Error(`Failed to contact Gemini service: ${error.message}`);
        }
    }

    buildPrompt(imports) {
        return `You are a precise Python dependency analyzer. Your task is to identify the correct PyPI package name for given import statements. You must also determine if a package is primarily for development (e.g., testing, linting, typing). Respond ONLY with a valid JSON object.

The JSON object must have a single root key "dependencies". This key's value must be an array of objects. Each object in the array represents a single dependency and must have three keys:
1. "name": The official, lowercased PyPI package name (e.g., "beautifulsoup4", not "bs4").
2. "isDev": A boolean, true if it's a development dependency (like pytest, black, mypy), otherwise false.
3. "description": A concise, one-sentence description of the package's purpose.

Analyze these Python imports:
${[...new Set(imports)].join('\n')}

Your JSON response:`;
    }

    parseAIResponse(content) {
        try {
            const result = JSON.parse(content);
            if (!result.dependencies || !Array.isArray(result.dependencies)) {
                throw new Error('Response is missing the "dependencies" array.');
            }
            
            return {
                dependencies: result.dependencies.map(dep => ({
                    name: (dep.name || '').toLowerCase().trim().replace(/_/g, '-'),
                    isDev: !!dep.isDev,
                    description: dep.description || ''
                })).filter(dep => dep.name)
            };
        } catch (error) {
            throw new Error(`Failed to parse AI response: ${error.message}. Response was: ${content}`);
        }
    }
}

module.exports = AIService;