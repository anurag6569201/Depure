const vscode = require('vscode');
const axios =require('axios');

class AIClient {
    async query(prompt, options = { isJson: false }) {
        const config = vscode.workspace.getConfiguration('depure.pro.llm');
        const apiKey = config.get('apiKey');
        const model = config.get('model');
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        if (!apiKey) {
            throw new Error('Google AI API key is not configured in settings (depure.pro.llm.apiKey).');
        }

        if (!model) {
            throw new Error('Google AI model is not configured in settings (depure.pro.llm.model).');
        }

        try {
            const requestBody = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.0,
                    maxOutputTokens: 8192,
                }
            };
            
            if (options.isJson) {
                requestBody.generationConfig.responseMimeType = "application/json";
            }

            const response = await axios.post(endpoint, requestBody, {
                headers: { 'Content-Type': 'application/json' }
            });
            
            const content = response.data.candidates[0]?.content?.parts[0]?.text;
            if (!content) {
                throw new Error('Received an empty response from the AI service.');
            }
            return content.trim();
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            throw new Error(`AI Service Error: ${errorMsg}`);
        }
    }
}

module.exports = AIClient;