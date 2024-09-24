const sharp = require("sharp");
const logger = require("../../utils/logger");
const {fileOcr} = require("./ocr.js");

async function processImage(filePath) {
    try {
        const metadata = await sharp(filePath).metadata();
        const ocrData = await fileOcr(filePath);

        let ocrContent = ocrData
            .map((item) => item.googleVisionText || "")
            .join("\n");

        const result = {
            metadata: metadata,
            ocrContent: ocrContent
        };

        logger.info(`Successfully processed image: ${filePath}`);
        return JSON.stringify(result, null, 2);
    } catch (error) {
        logger.error("Error processing image:", error);
        // throw error;
    }
}

module.exports = {
    processImage,
};
