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

    logContext(context) {
        this.channel.show(true);
        this.channel.clear();
        this.channel.appendLine('Depure Pro: Starting new analysis. Full context gathered:');

        this._logSection('Detected Framework', context.frameworkContext.type);
        
        if (context.frameworkContext.files.length > 0) {
            context.frameworkContext.files.forEach(file => {
                this._logSection(`Framework File: ${file.name}`, file.content);
            });
        }

        this._logSection('Full Project File Tree', context.fileTree);
        
        this._logSection('All Unique Imports Found', context.allImports.join('\n'));
    }

    log(message) {
        this.channel.appendLine(`[INFO] ${message}`);
    }

    error(message) {
        this.channel.appendLine(`[ERROR] ${message}`);
    }
}

module.exports = new Logger();