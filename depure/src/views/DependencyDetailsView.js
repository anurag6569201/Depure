const vscode = require('vscode');

let currentPanel = null;

async function showDependencyDetails(dependency, pypiService, context) {
    const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;

    if (currentPanel) {
        currentPanel.reveal(column);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
            'depureDetails',
            'Dependency Details',
            column,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
            }
        );

        currentPanel.onDidDispose(() => {
            currentPanel = null;
        });
    }

    currentPanel.title = `Depure: ${dependency.name}`;
    currentPanel.webview.html = getLoadingWebviewContent(dependency.name);

    const graphData = await pypiService.getTransitiveDependencies(dependency.name);

    currentPanel.webview.html = getWebviewContent(dependency, graphData, context);
}

function getLoadingWebviewContent(name) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Loading ${name}...</title>
        <style>
            body, html { margin: 0; padding: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
            .loader { border: 4px solid var(--vscode-editorWidget-border); border-top: 4px solid var(--vscode-button-background); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div class="loader"></div>
    </body>
    </html>`;
}

function getWebviewContent(dependency, graphData, context) {
    const pypiInfo = dependency.pypiData;
    const visJsPath = currentPanel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'vis-network.min.js'));

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${dependency.name} Details</title>
        <script src="${visJsPath}"></script>
        <style>
            :root {
                --border-color: var(--vscode-editorWidget-border, #444);
            }
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            .header {
                display: flex;
                align-items: center;
                margin-bottom: 24px;
                border-bottom: 1px solid var(--border-color);
                padding-bottom: 16px;
            }
            .package-name {
                font-size: 2em;
                font-weight: 600;
            }
            .package-version {
                font-size: 1.2em;
                color: var(--vscode-descriptionForeground);
                margin-left: 12px;
                background: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
                padding: 4px 8px;
                border-radius: 4px;
            }
            .section {
                margin-bottom: 24px;
            }
            .section-title {
                font-size: 1.4em;
                font-weight: 600;
                margin-bottom: 12px;
                color: var(--vscode-foreground);
            }
            .description {
                line-height: 1.6;
            }
            .details-grid {
                display: grid;
                grid-template-columns: 120px 1fr;
                gap: 8px 16px;
            }
            .details-grid dt {
                font-weight: 600;
                color: var(--vscode-descriptionForeground);
            }
            .details-grid dd {
                margin: 0;
                word-break: break-all;
            }
            a {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
            }
            a:hover {
                text-decoration: underline;
            }
            #dep-graph {
                width: 100%;
                height: 400px;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                background-color: var(--vscode-editorWidget-background);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <span class="package-name">${dependency.name}</span>
            <span class="package-version">v${dependency.version}</span>
        </div>

        <div class="section">
            <div class="section-title">Summary</div>
            <div class="description">${pypiInfo?.summary || 'No summary available.'}</div>
        </div>

        <div class="section">
            <div class="section-title">Details</div>
            <dl class="details-grid">
                ${pypiInfo.homePage ? `
                <dt>Homepage</dt>
                <dd><a href="${pypiInfo.homePage}">${pypiInfo.homePage}</a></dd>` : ''}
                ${pypiInfo.license ? `
                <dt>License</dt>
                <dd>${pypiInfo.license}</dd>` : ''}
                ${pypiInfo.requiresPython ? `
                <dt>Requires Python</dt>
                <dd>${pypiInfo.requiresPython}</dd>` : ''}
            </dl>
        </div>

        <div class="section">
            <div class="section-title">Dependency Graph</div>
            <div id="dep-graph"></div>
        </div>

        <script>
            const nodes = new vis.DataSet(${JSON.stringify(graphData.nodes)});
            const edges = new vis.DataSet(${JSON.stringify(graphData.edges)});
            const container = document.getElementById('dep-graph');
            const data = { nodes, edges };
            const options = {
                layout: {
                    hierarchical: {
                        enabled: true,
                        direction: 'UD',
                        sortMethod: 'directed',
                        levelSeparation: 100,
                        nodeSpacing: 150
                    }
                },
                nodes: {
                    shape: 'box',
                    margin: 10,
                    font: {
                        color: 'var(--vscode-editor-foreground)'
                    },
                    color: {
                        border: 'var(--vscode-button-background)',
                        background: 'var(--vscode-editorWidget-background)',
                        highlight: {
                            border: 'var(--vscode-button-hoverBackground)',
                            background: 'var(--vscode-list-hoverBackground)'
                        }
                    },
                    borderWidth: 2
                },
                edges: {
                    arrows: 'to',
                    color: {
                        color: 'var(--vscode-descriptionForeground)',
                        highlight: 'var(--vscode-textLink-foreground)'
                    },
                    smooth: {
                        type: 'cubicBezier'
                    }
                },
                physics: {
                    enabled: false
                }
            };
            new vis.Network(container, data, options);
        </script>
    </body>
    </html>
    `;
}

module.exports = {
    showDependencyDetails
};