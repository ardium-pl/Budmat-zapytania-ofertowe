const mammoth = require('mammoth');
const logger = require('../../utils/logger');

async function processWord(filePath) {
    try {
        const result = await mammoth.extractRawText({path: filePath});
        return `Word Document Content:\n${result.value}`;
    } catch (error) {
        logger.error('Error processing Word document:', error);
        return `Error processing Word document: ${error.message}`;
    }
}

module.exports = {
    processWord
};