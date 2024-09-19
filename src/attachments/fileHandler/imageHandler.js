const sharp = require("sharp");
const logger = require("../../utils/logger");
const { fileOcr } = require("./ocr.js");

async function processImage(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    const ocrData = await fileOcr(filePath);

    let ocrContent;
    // Extracting content from googleVisionText property
    ocrContent = ocrData
      .map((item) => item.googleVisionText || "")
      .join("\n");

    return `Image Metadata:\n${JSON.stringify(metadata, null, 2)}\n
Image OCR data:\n${ocrContent}`;
  } catch (error) {
    logger.error("Error processing image:", error);
    return `Error processing image: ${error.message}`;
  }
}

module.exports = {
  processImage,
};
