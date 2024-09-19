const sharp = require('sharp');
const logger = require('../../utils/logger');

async function processImage(filePath) {
    try {
        const metadata = await sharp(filePath).metadata();
        return `Image Metadata:\n${JSON.stringify(metadata, null, 2)}`;
    } catch (error) {
        logger.error('Error processing image:', error);
        return `Error processing image: ${error.message}`;
    }
}

module.exports = {
    processImage
};