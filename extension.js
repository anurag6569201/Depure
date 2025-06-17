const vscode = require('vscode');
const path = require('path');
const fs =require('fs');
const fetch = require('node-fetch');

// A representative list of Python 3.11+ standard library modules.
const PYTHON_STD_LIB = new Set([
    'abc', 'aifc', 'argparse', 'array', 'ast', 'asyncio', 'atexit', 'audioop',
    'base64', 'bdb', 'binascii', 'bisect', 'builtins', 'bz2', 'calendar', 'cgi',
    'cgitb', 'chunk', 'cmath', 'cmd', 'code', 'codecs', 'codeop', 'collections',
    'colorsys', 'compileall', 'concurrent', 'configparser', 'contextlib',
    'contextvars', 'copy', 'copyreg', 'crypt', 'csv', 'ctypes', 'curses',
    'dataclasses', 'datetime', 'dbm', 'decimal', 'difflib', 'dis', 'distutils',
    'doctest', 'email', 'ensurepip', 'enum', 'errno', 'faulthandler', 'fcntl',
    'filecmp', 'fileinput', 'fnmatch', 'fractions', 'ftplib', 'functools',
    'gc', 'getopt', 'getpass', 'gettext', 'glob', 'graphlib', 'grp', 'gzip',
    'hashlib', 'heapq', 'hmac', 'html', 'http', 'imaplib', 'imghdr', 'imp',
    'importlib', 'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword',
    'lib2to3', 'linecache', 'locale', 'logging', 'lzma', 'mailbox', 'mailcap',
    'marshal', 'math', 'mimetypes', 'mmap', 'modulefinder', 'multiprocessing',
    'netrc', 'nis', 'nntplib', 'numbers', 'operator', 'optparse', 'os',
    'ossaudiodev', 'pathlib', 'pdb', 'pickle', 'pickletools', 'pipes', 'pkgutil',
    'platform', 'plistlib', 'poplib', 'posix', 'pprint', 'profile', 'pstats',
    'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc', 'queue', 'quopri', 'random',
    're', 'readline', 'reprlib', 'resource', 'rlcompleter', 'runpy', 'sched',
    'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil', 'signal',
    'site', 'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver', 'spwd',
    'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
    'subprocess', 'sunau', 'symbol', 'symtable', 'sys', 'sysconfig', 'syslog',
    'tabnanny', 'tarfile', 'telnetlib', 'tempfile', 'termios', 'textwrap',
    'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize', 'trace',
    'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types', 'typing',
    'unicodedata', 'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings',
    'wave', 'weakref', 'webbrowser', 'wsgiref', 'xdrlib', 'xml', 'xmlrpc',
    'zipapp', 'zipfile', 'zipimport', 'zlib', 'zoneinfo'
]);

// Directories to always exclude from scanning
const COMMON_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'venv', '.venv', '__pycache__', 'env', '.vscode', 'dist', 'build']);

// The key for storing the Gemini API key in VS Code's secret storage
const GEMINI_API_KEY_SECRET = 'depure.geminiApiKey';

function activate(context) {
    const provider = new DepureViewProvider(context.extensionUri, context.secrets);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(DepureViewProvider.viewType, provider)
    );
}

class DepureViewProvider {
    static viewType = 'depureView';

    constructor(extensionUri, secrets) {
        this._extensionUri = extensionUri;
        this._secrets = secrets;
        this._view = null;
    }

    async resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview'),
                vscode.Uri.joinPath(this._extensionUri, 'icons')
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        const apiKey = await this._secrets.get(GEMINI_API_KEY_SECRET);
        webviewView.webview.postMessage({ command: 'apiKeyLoaded', key: apiKey });

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'saveApiKey':
                    await this._secrets.store(GEMINI_API_KEY_SECRET, message.key);
                    webviewView.webview.postMessage({ command: 'apiKeySaved', key: message.key });
                    break;
                case 'selectProject':
                    this.runFullAnalysis();
                    break;
                case 'generateFile':
                    this.generateFileWithLLM(message.type, message.data);
                    break;
            }
        });
    }

    async runFullAnalysis() {
        const apiKey = await this._secrets.get(GEMINI_API_KEY_SECRET);
        if (!apiKey) {
            this.updateStatus('Gemini API Key is not set.', 'error');
            return;
        }

        const rootUri = await this.selectProjectFolder();
        if (!rootUri) {
            this._view.webview.postMessage({ command: 'reset' });
            return;
        }

        this.updateStatus('Scanning project for Python imports...');
        const allImports = this.findAllProjectImports(rootUri.fsPath);
        if (allImports.size === 0) {
            this.updateStatus('No third-party imports found.', 'error');
            return;
        }

        this.updateStatus(`Found ${allImports.size} imports. Analyzing with Gemini...`);
        const analyzedData = await this.analyzeImportsWithLLM(Array.from(allImports), apiKey);
        if (!analyzedData) {
            this.updateStatus('Failed to get analysis from Gemini.', 'error');
            return;
        }

        this.updateStatus('Verifying packages and fetching latest versions from PyPI...');
        const finalData = await this.fetchPackageVersions(analyzedData);

        this._view.webview.postMessage({ command: 'analysisComplete', data: finalData });
    }

    async selectProjectFolder() {
        const options = { canSelectMany: false, canSelectFolders: true, openLabel: 'Analyze this Folder' };
        const selection = await vscode.window.showOpenDialog(options);
        return selection && selection[0] ? selection[0] : null;
    }

    findAllProjectImports(rootPath) {
        const pythonFiles = this.getAllPythonFiles(rootPath);
        const allImports = new Set();
        pythonFiles.forEach(file => {
            const imports = this.extractImportsFromFile(file);
            imports.forEach(imp => {
                if (!PYTHON_STD_LIB.has(imp)) {
                    allImports.add(imp);
                }
            });
        });
        return allImports;
    }

    async analyzeImportsWithLLM(imports, apiKey) {
        const prompt = `You are a Python dependency analysis expert. Given a list of Python import names, provide their correct PyPI package name, a one-sentence description, a relevant category, and identify if it's likely a development-only tool (like a linter or test framework).
        
        Return a single, minified JSON object. Each key is the original import name. The value is an object with keys: "pypi_package_name", "description", "category", and "is_dev_tool" (boolean).

        Example for input ["pandas", "pytest"]:
        {"pandas":{"pypi_package_name":"pandas","description":"Powerful data structures for data analysis, time series, and statistics.","category":"Data Science","is_dev_tool":false},"pytest":{"pypi_package_name":"pytest","description":"A mature full-featured Python testing tool.","category":"Testing","is_dev_tool":true}}

        List of imports to analyze: ${JSON.stringify(imports)}`;

        try {
            const response = await this.callGemini(prompt, apiKey);
            return JSON.parse(response);
        } catch (error) {
            console.error('LLM Analysis Error:', error);
            this.updateStatus(`Error during analysis: ${error.message}`, 'error');
            return null;
        }
    }

    async fetchPackageVersions(analyzedData) {
        const finalData = {};
        for (const importName in analyzedData) {
            const pkg = analyzedData[importName];
            const pypiName = pkg.pypi_package_name;
            if (pypiName) {
                try {
                    const pypiUrl = `https://pypi.org/pypi/${pypiName}/json`;
                    const response = await fetch(pypiUrl);
                    if (response.ok) {
                        const pypiInfo = await response.json();
                        pkg.latest_version = pypiInfo.info.version;
                        pkg.license = pypiInfo.info.license || 'N/A';
                    } else {
                        pkg.latest_version = 'N/A';
                        pkg.license = 'N/A';
                    }
                } catch (error) {
                    pkg.latest_version = 'Error';
                    pkg.license = 'Error';
                }
            }
            finalData[importName] = pkg;
        }
        return finalData;
    }
    
    async generateFileWithLLM(type, data) {
        const apiKey = await this._secrets.get(GEMINI_API_KEY_SECRET);
        let prompt;
        let fileName;
        
        switch (type) {
            case 'requirements_prod':
                prompt = `Create a professional 'requirements.txt' file from the following JSON data. Use '==' for version pinning. Group packages by category using comments (e.g., # Web Frameworks). Exclude any packages where 'is_dev_tool' is true. Only include the package name and version, do not add inline comments per package.
                Data: ${JSON.stringify(data)}`;
                fileName = 'requirements.txt';
                break;
            case 'requirements_dev':
                prompt = `Create a 'requirements.dev.txt' file for development dependencies from the following JSON data. Only include packages where 'is_dev_tool' is true. Pin versions with '==' and group them by category using comments (e.g., # Testing).
                Data: ${JSON.stringify(data)}`;
                fileName = 'requirements.dev.txt';
                break;
            case 'report_md':
                prompt = `Create a comprehensive 'PROJECT_REPORT.md' in Markdown format based on the following JSON data. Include a summary, a table of all dependencies (Package, Version, Category, License, Description), and a section discussing the project's dependency footprint.
                Data: ${JSON.stringify(data)}`;
                fileName = 'PROJECT_REPORT.md';
                break;
            default: return;
        }
        
        try {
            this.updateStatus(`Generating ${fileName} with Gemini...`);
            const fileContent = await this.callGemini(prompt, apiKey);
            this.saveFile(fileName, fileContent);
        } catch (error) {
            this.updateStatus(`Failed to generate ${fileName}: ${error.message}`, 'error');
        }
    }

    async callGemini(prompt, apiKey) {
        const model = 'gemini-1.5-flash-latest';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`API request failed: ${errorBody.error.message}`);
        }
        const data = await response.json();
        // Add safety check for candidates array
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('API returned no candidates in response.');
        }
        const textResponse = data.candidates[0].content.parts[0].text;
        return textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    
    saveFile(fileName, content) {
        if (!vscode.workspace.workspaceFolders) {
            this.updateStatus('Cannot save file: No workspace folder is open.', 'error');
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const filePath = path.join(workspaceRoot, fileName);
        fs.writeFileSync(filePath, content, 'utf8');
        vscode.window.showInformationMessage(`${fileName} has been generated successfully.`);
        vscode.workspace.openTextDocument(filePath).then(doc => vscode.window.showTextDocument(doc));
        this.updateStatus(`${fileName} generated successfully.`, 'success');
    }

    updateStatus(message, type = 'info') {
        if (this._view) {
            this._view.webview.postMessage({ command: 'updateStatus', text: message, type: type });
        }
    }

    getAllPythonFiles(dirPath, arrayOfFiles = []) {
        try {
            const files = fs.readdirSync(dirPath);
            files.forEach(file => {
                const fullPath = path.join(dirPath, file);
                const dirName = path.basename(fullPath);
                if (COMMON_EXCLUDE_DIRS.has(dirName)) {
                    return;
                }
                if (fs.statSync(fullPath).isDirectory()) {
                    this.getAllPythonFiles(fullPath, arrayOfFiles);
                } else if (path.extname(file) === '.py') {
                    arrayOfFiles.push(fullPath);
                }
            });
        } catch (error) {
            this.updateStatus(`Error reading directory: ${error.message}`, 'error');
        }
        return arrayOfFiles;
    }

    extractImportsFromFile(filePath) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const imports = new Set();
            const importRegex = /(?:^from\s+([a-zA-Z0-9_]+)[.\w\s]*\s+import\s+.*|^import\s+([a-zA-Z0-9_]+))/gm;
            let match;
            while ((match = importRegex.exec(fileContent)) !== null) {
                const importName = match[1] || match[2];
                if (importName) {
                    imports.add(importName.split('.')[0]);
                }
            }
            return Array.from(imports);
        } catch (error) {
            this.updateStatus(`Error reading file ${path.basename(filePath)}: ${error.message}`, 'error');
            return [];
        }
    }

    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'style.css'));
        const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview', 'codicon.css'));
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'webview', 'sidebar.html');
        let htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
        htmlContent = htmlContent
            .replace(/{{styleUri}}/g, styleUri)
            .replace(/{{scriptUri}}/g, scriptUri)
            .replace(/{{codiconUri}}/g, codiconUri);
        return htmlContent;
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};