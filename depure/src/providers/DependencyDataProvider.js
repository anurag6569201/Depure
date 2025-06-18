const vscode = require('vscode');
const DependencyTreeItem = require('./DependencyTreeItem');
const semver = require('semver');

class DependencyDataProvider {
    constructor(context) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.context = context;
        this.dependencies = { prod: [], dev: [] };
    }

    setDependencies(deps) {
        // --- THIS IS THE FIX ---
        // This helper function is now robust against invalid version strings.
        const getUpdateStatus = (dep) => {
            // Ensure we have valid data to compare
            if (!dep.pypiData || !dep.pypiData.version || !dep.version || dep.version === 'N/A') {
                return false;
            }

            try {
                // Coerce strings into valid semver objects before comparing
                const latestVersion = semver.coerce(dep.pypiData.version);
                const currentVersion = semver.coerce(dep.version);

                // If coercion fails, they will be null.
                if (!latestVersion || !currentVersion) {
                    return false;
                }
                
                return semver.gt(latestVersion, currentVersion);
            } catch (e) {
                // As a final safety net, log a warning and continue.
                console.warn(`Could not compare versions for ${dep.name}:`, dep.pypiData.version, dep.version);
                return false;
            }
        };
        // --- END OF FIX ---

        this.dependencies.prod = deps.filter(d => !d.isDev && d.isValid).map(d => ({...d, updateAvailable: getUpdateStatus(d) }));
        this.dependencies.dev = deps.filter(d => d.isDev && d.isValid).map(d => ({...d, updateAvailable: getUpdateStatus(d) }));
        
        this.refresh();
    }

    getDependencies() {
        return [...this.dependencies.prod, ...this.dependencies.dev];
    }
    
    getDependency(name) {
        return this.getDependencies().find(d => d.name === name);
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            if (this.dependencies.prod.length === 0 && this.dependencies.dev.length === 0) {
                return [new DependencyTreeItem('Welcome to Depure!', null, 'welcome', this.context)];
            }
            const prodDeps = this.dependencies.prod.length > 0 ? [new DependencyTreeItem('Production', `${this.dependencies.prod.length} packages`, 'group', null, vscode.TreeItemCollapsibleState.Expanded)] : [];
            const devDeps = this.dependencies.dev.length > 0 ? [new DependencyTreeItem('Development', `${this.dependencies.dev.length} packages`, 'group', null, vscode.TreeItemCollapsibleState.Expanded)] : [];
            return [...prodDeps, ...devDeps];
        }

        if (element.contextValue === 'group') {
            const deps = element.label === 'Production' ? this.dependencies.prod : this.dependencies.dev;
            return deps
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(dep => new DependencyTreeItem(dep.name, null, 'dependency', dep));
        }
        
        return [];
    }

    setDependencyType(name, isDev) {
        const move = (source, dest) => {
            const index = this.dependencies[source].findIndex(d => d.name === name);
            if (index > -1) {
                const [dep] = this.dependencies[source].splice(index, 1);
                dep.isDev = isDev;
                this.dependencies[dest].push(dep);
                this.refresh();
            }
        };

        if (isDev) {
            move('prod', 'dev');
        } else {
            move('dev', 'prod');
        }
    }

    updateDependencyVersion(name, newVersion) {
        const dep = this.getDependency(name);
        if (dep) {
            dep.version = newVersion;
            dep.updateAvailable = false;
            this.refresh();
        }
    }

    async updateAllDependencies() {
        const allDeps = this.getDependencies();
        for (const dep of allDeps) {
            if (dep.updateAvailable && dep.pypiData) {
                this.updateDependencyVersion(dep.name, dep.pypiData.version);
            }
        }
        this.refresh();
    }
}

module.exports = DependencyDataProvider;