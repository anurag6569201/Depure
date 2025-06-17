(function () {
    const vscode = acquireVsCodeApi();
    const state = {
        apiKey: '',
        analysisData: null
    };

    // --- Element References ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const generateTabBtn = document.getElementById('generate-tab-btn');
    const statusMessage = document.getElementById('status-message');
    const loader = document.getElementById('loader');
    
    // Tab 1: Dependencies
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const analysisResultsSection = document.getElementById('analysis-results-section');
    const geminiAnalysisList = document.getElementById('gemini-analysis-list');
    const clearBtn = document.getElementById('clear-btn');

    // Tab 2: Generate
    const genReqsBtn = document.getElementById('gen-reqs-btn');
    const genDevReqsBtn = document.getElementById('gen-dev-reqs-btn');
    const genReportBtn = document.getElementById('gen-report-btn');

    // Tab 3: Settings
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const apiKeyStatus = document.getElementById('api-key-status');

    // --- Event Listeners ---

    // Tab Navigation
    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (e.currentTarget.disabled) return;
            const tabId = link.getAttribute('data-tab');
            
            tabLinks.forEach(l => l.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Button Clicks
    selectFolderBtn.addEventListener('click', () => {
        if (!state.apiKey && !geminiApiKeyInput.value) {
            updateStatus('Please save a Gemini API key in the Settings tab first.', 'error');
            return;
        }
        vscode.postMessage({ command: 'selectProject' });
        showLoader(true, 'Select a project folder to analyze...');
    });
    
    clearBtn.addEventListener('click', () => resetUI());

    genReqsBtn.addEventListener('click', () => {
        showLoader(true, 'Generating requirements.txt with Gemini...');
        vscode.postMessage({ command: 'generateFile', type: 'requirements_prod', data: state.analysisData });
    });

    genDevReqsBtn.addEventListener('click', () => {
        showLoader(true, 'Generating requirements.dev.txt...');
        vscode.postMessage({ command: 'generateFile', type: 'requirements_dev', data: state.analysisData });
    });

    genReportBtn.addEventListener('click', () => {
        showLoader(true, 'Generating project report with Gemini...');
        vscode.postMessage({ command: 'generateFile', type: 'report_md', data: state.analysisData });
    });

    saveKeyBtn.addEventListener('click', () => {
        const key = geminiApiKeyInput.value;
        if (key) {
            vscode.postMessage({ command: 'saveApiKey', key: key });
            apiKeyStatus.textContent = 'Saving...';
        }
    });

    // --- Message Handling from Extension ---
    window.addEventListener('message', event => {
        const message = event.data;
        showLoader(false);

        switch (message.command) {
            case 'updateStatus':
                updateStatus(message.text, message.type);
                break;
            case 'apiKeyLoaded':
                if(message.key) {
                    state.apiKey = message.key;
                    apiKeyStatus.textContent = 'A saved API key is loaded.';
                } else {
                    apiKeyStatus.textContent = 'No API key found. Please add one.';
                }
                break;
            case 'apiKeySaved':
                state.apiKey = message.key;
                geminiApiKeyInput.value = '';
                updateStatus('API Key securely saved.', 'success');
                break;
            case 'analysisComplete':
                state.analysisData = message.data;
                displayAnalysisResults(message.data);
                break;
            case 'reset':
                resetUI();
                break;
        }
    });

    // --- Helper Functions ---
    function resetUI() {
        analysisResultsSection.classList.add('hidden');
        geminiAnalysisList.innerHTML = '';
        generateTabBtn.disabled = true;
        state.analysisData = null;
        selectFolderBtn.disabled = false;
        updateStatus('Ready. Select a project folder to begin analysis.');
        if (tabLinks[0].disabled) tabLinks[0].disabled = false;
        // Switch to first tab
        tabLinks[0].click();
    }
    
    function showLoader(visible, text = '') {
        loader.classList.toggle('hidden', !visible);
        if (text) updateStatus(text);
    }

    function updateStatus(text, type = 'info') {
        statusMessage.textContent = text;
        statusMessage.className = `status-${type}`;
    }

    function displayAnalysisResults(analysisData) {
        geminiAnalysisList.innerHTML = '';
        if (!analysisData || Object.keys(analysisData).length === 0) {
            updateStatus('Could not find any third-party packages to analyze.', 'error');
            return;
        }

        for (const pkgName in analysisData) {
            const data = analysisData[pkgName];
            const card = document.createElement('div');
            card.className = 'gemini-card';

            const pypiName = data.pypi_package_name || pkgName;
            const version = data.latest_version ? `@${data.latest_version}` : '';

            card.innerHTML = `
                <div class="gemini-card-header">
                    <span class="gemini-card-header-title">${pypiName}${version}</span>
                    <span class="gemini-card-category">${data.category || 'General'}</span>
                </div>
                <p class="gemini-card-description">${data.description || 'No description provided.'}</p>
            `;
            geminiAnalysisList.appendChild(card);
        }
        
        analysisResultsSection.classList.remove('hidden');
        generateTabBtn.disabled = false;
        selectFolderBtn.disabled = true;
        updateStatus(`Analysis complete! Found ${Object.keys(analysisData).length} packages.`, 'success');
    }

    // Initialize the view
    resetUI();
}());