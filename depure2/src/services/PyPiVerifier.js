const axios = require('axios');
const logger = require('../utils/logger');

class PyPiVerifier {
    constructor() {
        this.packageUrl = 'https://pypi.org/pypi';
        this.packageDataCache = new Map();
    }

    /**
     * Takes a list of top-level packages and resolves their first-level dependencies.
     * @param {string[]} topLevelPackages - A list of canonical top-level package names.
     * @returns {Promise<Map<string, {name: string, version: string}>>} A map of all required packages.
     */
    async getDependenciesFor(topLevelPackages) {
        this.packageDataCache.clear();
        logger.log(`PyPI Verifier: Resolving dependencies for ${topLevelPackages.length} top-level packages.`);
        
        const allRequiredPackages = new Map();

        // Fetch data for all top-level packages first
        const topLevelLookups = topLevelPackages.map(pkgName => this.getPackageData(pkgName));
        const verifiedTopLevel = (await Promise.all(topLevelLookups)).filter(Boolean);

        // Add the top-level packages themselves to the final list
        for (const pkg of verifiedTopLevel) {
            allRequiredPackages.set(pkg.name, { name: pkg.name, version: pkg.version });
        }

        // Now, fetch the first-level dependencies for each top-level package
        const transitiveLookups = [];
        for (const pkg of verifiedTopLevel) {
            if (pkg.requires && pkg.requires.length > 0) {
                for (const depName of pkg.requires) {
                    // Only look up if we don't already have it
                    if (!allRequiredPackages.has(depName)) {
                        transitiveLookups.push(this.getPackageData(depName));
                    }
                }
            }
        }
        
        const transitivePackages = (await Promise.all(transitiveLookups)).filter(Boolean);
        for (const pkg of transitivePackages) {
            allRequiredPackages.set(pkg.name, { name: pkg.name, version: pkg.version });
        }

        logger.log(`PyPI Verifier: Resolution complete. Total packages: ${allRequiredPackages.size}.`);
        return allRequiredPackages;
    }

    /**
     * Fetches a single package's JSON to get its canonical name, version, and requires_dist list.
     */
    async getPackageData(packageName) {
        if (!packageName) return null;
        const normalizedName = packageName.toLowerCase().replace(/_/g, '-');
        if (this.packageDataCache.has(normalizedName)) {
            return this.packageDataCache.get(normalizedName);
        }

        try {
            const response = await axios.get(`${this.packageUrl}/${normalizedName}/json`, { timeout: 7000 });
            const info = response.data?.info;
            const requiresDist = info?.requires_dist;
            
            if (info) {
                const dependencies = requiresDist && Array.isArray(requiresDist)
                    ? requiresDist.map(dep => dep.split(/[;[=<>!~]/)[0].trim().toLowerCase()).filter(Boolean)
                    : [];
                
                const pkgData = {
                    name: info.name,
                    version: info.version,
                    requires: dependencies
                };
                
                logger.log(`PyPI Success for "${normalizedName}": Found "${pkgData.name}".`);
                this.packageDataCache.set(normalizedName, pkgData);
                return pkgData;
            }
        } catch (error) {
            if (!(error.response && error.response.status === 404)) {
                logger.error(`PyPI lookup for "${normalizedName}" failed: ${error.message}`);
            }
        }

        this.packageDataCache.set(normalizedName, null);
        return null;
    }
}

module.exports = PyPiVerifier;