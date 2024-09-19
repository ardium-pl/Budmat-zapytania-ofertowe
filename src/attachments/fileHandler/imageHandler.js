const sharp = require('sharp');
const logger = require('../../utils/logger');
const { fileOcr } = require('./ocr.js');

async function processImage(filePath) {
    try {
        const metadata = await sharp(filePath).metadata();
        const ocrData = await fileOcr(filePath);

        // Convert ocrData to a string, assuming it's an object or array
        const ocrDataString = Array.isArray(ocrData) 
            ? ocrData.join('\n') 
            : JSON.stringify(ocrData, null, 2);

        return `Image Metadata:\n${JSON.stringify(metadata, null, 2)}\n
        Image OCR data:\n${ocrDataString}`;
    } catch (error) {
        logger.error('Error processing image:', error);
        return `Error processing image: ${error.message}`;
    }
}

module.exports = {
    processImage
};
