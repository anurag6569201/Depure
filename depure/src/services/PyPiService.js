const axios = require('axios');
const semver = require('semver');

class PyPiService {
    constructor(state) {
        this.state = state;
        this.baseUrl = 'https://pypi.org/pypi';
        this.cacheKey = 'pypiCache';
        this.cache = this.state.get(this.cacheKey, {});
        this.cacheTTL = 3600 * 1000; // 1 hour
    }

    async getPackageInfo(packageName) {
        const cached = this.cache[packageName];
        if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
            return cached.data;
        }

        try {
            const response = await axios.get(`${this.baseUrl}/${packageName}/json`, { timeout: 7000 });
            if (response.status === 200 && response.data) {
                const info = this.extractPackageInfo(response.data);
                this.cache[packageName] = { data: info, timestamp: Date.now() };
                await this.state.update(this.cacheKey, this.cache);
                return info;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    extractPackageInfo(pypiData) {
        const info = pypiData.info || {};
        const versions = Object.keys(pypiData.releases || {}).filter(v => semver.valid(v));
        const latestVersion = versions.sort(semver.rcompare)[0] || info.version;
        
        let transitiveDeps = [];
        if (pypiData.releases && pypiData.releases[latestVersion]) {
            const latestReleaseFiles = pypiData.releases[latestVersion];
            if (latestReleaseFiles.length > 0 && latestReleaseFiles[0].requires_dist) {
                transitiveDeps = latestReleaseFiles[0].requires_dist;
            }
        }
        if (transitiveDeps.length === 0) {
            transitiveDeps = info.requires_dist || [];
        }

        return {
            name: info.name,
            version: latestVersion,
            summary: info.summary,
            description: info.description,
            homePage: info.home_page || info.project_urls?.Homepage || info.project_urls?.['Source Code'],
            license: info.license,
            requiresPython: info.requires_python,
            dependencies: transitiveDeps.map(d => d.split(' ')[0])
        };
    }
    
    async getTransitiveDependencies(packageName, depth = 0, maxDepth = 2) {
        if (depth > maxDepth) {
            return { nodes: [], edges: [] };
        }

        const info = await this.getPackageInfo(packageName);
        if (!info) {
            return { nodes: [], edges: [] };
        }

        const nodes = [{ id: packageName, label: packageName, level: depth }];
        const edges = [];
        const subDependencies = new Set();
        
        for (const depName of (info.dependencies || [])) {
             const cleanedDepName = depName.replace(/\[.*?\]/g, '').split(/[=<>!;]/)[0].trim();
             if(cleanedDepName && cleanedDepName !== packageName) {
                subDependencies.add(cleanedDepName);
             }
        }

        for (const dep of subDependencies) {
            edges.push({ from: packageName, to: dep });
            const result = await this.getTransitiveDependencies(dep, depth + 1, maxDepth);
            nodes.push(...result.nodes);
            edges.push(...result.edges);
        }
        
        return { nodes, edges };
    }
}

module.exports = PyPiService;