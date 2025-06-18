const axios = require('axios');
const logger = require('../utils/logger');

class PyPiVerifier {
    constructor() {
        this.searchUrl = 'https://pypi.org/search/';
        this.packageUrl = 'https://pypi.org/pypi';
        this.searchCache = new Map();
        this.packageCache = new Map();
    }

    async resolveDependencies(imports) {
        this.searchCache.clear();
        this.packageCache.clear();
        logger.log('PyPI Verifier: Starting dependency resolution.');

        const directPackages = await this.findDirectPackages(imports);
        logger.log(`PyPI Verifier: Found ${directPackages.size} potential direct packages.`);
        
        const allPackages = await this.findTransitivePackages(directPackages);
        logger.log(`PyPI Verifier: Resolution complete. Found ${allPackages.size} total packages (direct + transitive).`);

        return allPackages;
    }

    async findDirectPackages(imports) {
        const directPackages = new Map();
        for (const imp of imports) {
            // Ignore standard library modules that might have slipped through
            if (['os', 'sys', 'json', 'datetime', 'pathlib', 'typing', 'logging', 'enum'].includes(imp)) continue;

            const searchTerm = imp.replace(/_/g, '-');
            const pkg = await this.searchForPackage(searchTerm);
            if (pkg && !directPackages.has(pkg.name)) {
                directPackages.set(pkg.name, pkg);
            }
        }
        return directPackages;
    }

    async searchForPackage(searchTerm) {
        if (this.searchCache.has(searchTerm)) return this.searchCache.get(searchTerm);

        try {
            const response = await axios.get(this.searchUrl, {
                params: { q: searchTerm },
                timeout: 7000,
                headers: { 'Accept': 'application/json' }
            });

            if (response.status === 200 && response.data.results && response.data.results.length > 0) {
                const topHit = response.data.results[0];
                const pkgData = {
                    name: topHit.name,
                    version: topHit.version,
                    summary: topHit.description,
                };
                logger.log(`PyPI Search Hit for "${searchTerm}": Found canonical package "${pkgData.name}".`);
                this.searchCache.set(searchTerm, pkgData);
                return pkgData;
            }
        } catch (error) {
            logger.error(`PyPI search request failed for "${searchTerm}": ${error.message}`);
        }
        
        logger.log(`PyPI Search Miss for "${searchTerm}": No package found.`);
        this.searchCache.set(searchTerm, null);
        return null;
    }
    
    async findTransitivePackages(directPackages) {
        const allPackages = new Map(directPackages);
        const queue = [...directPackages.keys()];
        const processed = new Set();

        while (queue.length > 0) {
            const pkgName = queue.shift();
            if (processed.has(pkgName)) continue;
            processed.add(pkgName);

            const dependencies = await this.getPackageDependencies(pkgName);
            for (const depName of dependencies) {
                if (!allPackages.has(depName)) {
                    const pkgInfo = await this.searchForPackage(depName);
                    if (pkgInfo) {
                        allPackages.set(pkgInfo.name, pkgInfo);
                        queue.push(pkgInfo.name);
                    }
                }
            }
        }
        return allPackages;
    }

    async getPackageDependencies(packageName) {
        if (this.packageCache.has(packageName)) return this.packageCache.get(packageName);

        try {
            const response = await axios.get(`${this.packageUrl}/${packageName}/json`, { timeout: 7000 });
            const requiresDist = response.data?.info?.requires_dist;

            if (requiresDist && Array.isArray(requiresDist)) {
                const dependencies = requiresDist
                    .map(dep => dep.split(/[;[=<>!~]/)[0].trim().toLowerCase())
                    .filter(Boolean);
                this.packageCache.set(packageName, dependencies);
                return dependencies;
            }
        } catch (error) {
            // It's okay to fail here, just means no transitive deps found for this package
        }
        this.packageCache.set(packageName, []);
        return [];
    }
}

module.exports = PyPiVerifier;