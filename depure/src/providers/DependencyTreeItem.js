const vscode = require('vscode');
const path = require('path');

class DependencyTreeItem extends vscode.TreeItem {
    constructor(label, description, contextValue, dependencyOrContext, collapsibleState = vscode.TreeItemCollapsibleState.None) {
        super(label, collapsibleState);
        this.description = description;
        this.contextValue = contextValue;

        if (contextValue === 'dependency') {
            this.dependency = dependencyOrContext;
            this.description = this.dependency.version;
            this.tooltip = new vscode.MarkdownString();
            this.tooltip.appendMarkdown(`**${this.dependency.name}**\n\n`);
            this.tooltip.appendMarkdown(`${this.dependency.description || 'No description available.'}\n\n`);
            if (this.dependency.updateAvailable) {
                this.tooltip.appendMarkdown(`*Update available: v${this.dependency.pypiData.version}*`);
            }
            
            this.command = {
                command: 'depure.showDetails',
                title: 'Show Details',
                arguments: [this]
            };
            this.setIcon();
        } else if (contextValue === 'welcome') {
             this.description = 'Click to get started';
             this.command = { command: 'depure.analyzeWorkspace', title: 'Analyze Workspace' };
             this.iconPath = {
                light: path.join(dependencyOrContext.extensionPath, 'media', 'depure-icon.svg'),
                dark: path.join(dependencyOrContext.extensionPath, 'media', 'depure-icon.svg')
            };
        } else if (contextValue === 'group') {
            this.iconPath = new vscode.ThemeIcon('folder-library');
        }
    }

    setIcon() {
        if (!this.dependency) return;
        
        let icon;
        if (this.dependency.updateAvailable) {
            icon = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('testing.iconQueued'));
        } else if (this.dependency.isValid) {
            icon = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else {
            icon = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconFailed'));
        }
        this.iconPath = icon;
    }
}

module.exports = DependencyTreeItem;