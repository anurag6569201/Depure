const vscode = require('vscode');

class Logger {
    constructor() {
        this.channel = vscode.window.createOutputChannel("Depure Pro");
    }

    _logSection(title, content) {
        const separator = '─'.repeat(50);
        this.channel.appendLine(`\n${separator}`);
        this.channel.appendLine(`-- ${title} --`);
        this.channel.appendLine(separator);
        this.channel.appendLine(content || 'Not available or empty.');
        this.channel.appendLine(separator + '\n');
    }

    logKnowledgeBase(kb) {
        this.channel.show(true);
        this.channel.clear();
        this.channel.appendLine('Depure Pro: Starting new analysis. Full context gathered:');

        this._logSection('Detected Framework', kb.framework.type);
        
        if (kb.framework.details.length > 0) {
            this._logSection(`Framework Details`, kb.framework.details.join('\n'));
        }
        
        this._logSection('All Unique Import Statements Found', kb.allImports.join('\n'));

        this._logSection('Dependency Candidates (for PyPI lookup)', Array.from(kb.candidates).join('\n'));
        
        this._logSection('Local Symbols Detected (partial list)', Array.from(kb.localSymbols).slice(0, 50).join(', '));
    }
    
    log(message, data) {
        this.channel.appendLine(`[INFO] ${message}`);
        if(data) {
             this.channel.appendLine(data);
        }
    }

    error(message) {
        this.channel.appendLine(`[ERROR] ${message}`);
    }
}

module.exports = new Logger();