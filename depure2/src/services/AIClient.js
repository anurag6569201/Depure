const vscode = require('vscode');
const axios =require('axios');

class AIClient {
    async query(prompt) {
        const config = vscode.workspace.getConfiguration('depure.pro.llm');
        const apiKey = config.get('apiKey');
        const model = config.get('model');
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        if (!apiKey) throw new Error('Google AI API key is not configured (depure.pro.llm.apiKey).');
        if (!model) throw new Error('Google AI model is not configured (depure.pro.llm.model).');

        try {
            const requestBody = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.0,
                    maxOutputTokens: 8192,
                }
            };
            
            // Check if prompt hints at JSON output
            if (prompt.includes("JSON")) {
                 requestBody.generationConfig.responseMimeType = "application/json";
            }

            const response = await axios.post(endpoint, requestBody, { headers: { 'Content-Type': 'application/json' } });
            
            let content = response.data.candidates[0]?.content?.parts[0]?.text;
            if (!content) throw new Error('Received an empty response from the AI service.');

            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                content = jsonMatch[1];
            }
            
            return content.trim();
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            throw new Error(`AI Service Error: ${errorMsg}`);
        }
    }
}

module.exports = AIClient;