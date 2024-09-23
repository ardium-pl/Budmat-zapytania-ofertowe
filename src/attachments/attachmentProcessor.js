const fs = require('fs').promises;
const path = require('path');
const {processPDF} = require('./fileHandler/pdfHandler');
const {processWord} = require('./fileHandler/wordHandler');
const {processSpreadsheet} = require('./fileHandler/spreadsheetHandler');
const {processImage} = require('./fileHandler/imageHandler');
const {PROCESSED_DIR} = require('../../config/constants');
const logger = require('../utils/logger');


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

    // Get the corresponding processing function for the extension
    const processor = fileProcessors[extension.toLowerCase()];

    if (!processor) {
        logger.warn(`Unsupported file format: ${extension}`);
        return;
    }

    // Call the corresponding processor function
    processedContent = await processor(filePath);

    const formatDir = extension.toLowerCase().replace('.', '');
    const destDir = path.join(PROCESSED_DIR, formatDir);
    await fs.mkdir(destDir, {recursive: true});

    const destFilePath = path.join(destDir, fileName);
    const processedFilePath = path.join(destDir, `${path.parse(fileName).name}_processed.json`);

    await fs.copyFile(filePath, destFilePath);
    await fs.writeFile(processedFilePath, processedContent);

    logger.info(`Processed ${fileName} and saved results to ${processedFilePath}`);
}

module.exports = {
    processAttachment
};
