const fg = require('fast-glob');
const fs = require('fs/promises');
const { parsePythonImports } = require('../utils/pythonUtils');

class ImportParser {

    async parseWorkspace(folderPath, excludePatterns) {
        const pyFiles = await fg([`${folderPath}/**/*.py`], {
            ignore: excludePatterns,
            dot: false,
            absolute: true
        });

        const allImports = new Set();
        for (const file of pyFiles) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                const imports = parsePythonImports(content);
                imports.forEach(imp => allImports.add(imp));
            } catch (error) {
                console.warn(`Could not parse ${file}: ${error.message}`);
            }
        }

        return Array.from(allImports);
    }
}

module.exports = ImportParser;