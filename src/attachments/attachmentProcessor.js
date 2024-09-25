const fs = require('fs').promises;
const path = require('path');
const {processPDF} = require('./fileHandler/pdfHandler');
const {processWord} = require('./fileHandler/wordHandler');
const {processSpreadsheet} = require('./fileHandler/spreadsheetHandler');
const {processImage} = require('./fileHandler/imageHandler');
const {PROCESSED_DIR} = require('../../config/constants');
const {createLogger}  = require('../utils/logger');
const logger = createLogger(__filename);


const fileProcessors = {
    '.pdf': processPDF,
    '.doc': processWord,
    '.docx': processWord,
    '.xls': processSpreadsheet,
    '.xlsx': processSpreadsheet,
    '.csv': processSpreadsheet,
    '.png': processImage,
    '.jpg': processImage,
    '.jpeg': processImage
};

async function processAttachment(filePath, extension) {
    const fileName = path.basename(filePath);
    let processedContent = '';

    const processor = fileProcessors[extension.toLowerCase()];

    if (!processor) {
        logger.warn(`Unsupported file format: ${extension}`);
        return null;
    }

    processedContent = await processor(filePath);

    const processedFilePath = path.join(path.dirname(filePath), `${path.parse(fileName).name}_processed.json`);
    await fs.writeFile(processedFilePath, processedContent);

    logger.info(`Processed ${fileName} and saved results to ${processedFilePath}`);
    return processedFilePath;
}

module.exports = {
    processAttachment
};
