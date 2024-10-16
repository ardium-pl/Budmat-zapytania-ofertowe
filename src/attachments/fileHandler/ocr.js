const vision = require("@google-cloud/vision");
const dotenv = require("dotenv");
const fs = require("fs-extra");
const path = require("path");
const { convertPdfToImages } = require("../../utils/convertPdfToImage.js");
const { deleteFile } = require("../../utils/deleteFile.js");
const { createLogger } = require("../../utils/logger");
const logger = createLogger(__filename);
const { DATA_DIR } = require("../../../config/constants");
dotenv.config();

const VISION_AUTH = {
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Handling the private key newline issue
  },
  fallback: true, // Force use of REST API instead of gRPC
};

async function pdfOCR(pdfFilePath) {
  const inputPdfFolder = path.join(DATA_DIR, "attachments");
  const imagesFolder = path.join(DATA_DIR, "images");
  const outputTextFolder = path.join(DATA_DIR, "processed_attachments/pdf");
  const fileNameWithoutExt = path.basename(pdfFilePath, ".pdf");

  await Promise.all(
    [inputPdfFolder, imagesFolder, outputTextFolder].map(fs.ensureDir)
  );

  try {
    const imageFilePaths = await convertPdfToImages(pdfFilePath, imagesFolder);
    logger.info(`🖼️ Converted PDF to images: ${imageFilePaths.join(", ")}`);

    if (imageFilePaths.length === 0) {
      logger.error("No images were generated from the PDF");
      return [];
    }

    let concatenatedResults = "";
    for (const imageFilePath of imageFilePaths) {
      const ocrResult = await fileOcr(imageFilePath, outputTextFolder);
      if (ocrResult) {
        concatenatedResults += ocrResult.googleVisionText + "\n";
      } else {
        logger.warn(`No text found in image: ${imageFilePath}`);
      }
    }

    await _saveDataToTxt(
      outputTextFolder,
      fileNameWithoutExt,
      concatenatedResults
    );

    logger.info(
      ` 💚 Successfully processed and saved the OCR results for ${pdfFilePath}`
    );

    // Delete the image files after processing
    for (const imageFilePath of imageFilePaths) {
      logger.warn(`Deleting temporary image: ${imageFilePath}`);
      await deleteFile(imageFilePath);
    }

    return concatenatedResults;
  } catch (err) {
    logger.error(`Error processing ${pdfFilePath}:`, err);
    return "";
  }
}

async function _saveDataToTxt(folder, fileNameWithoutExt, text) {
  const textPath = path.join(folder, `${fileNameWithoutExt}.txt`);

  try {
    await fs.writeFile(textPath, text, "utf8");
    logger.info(` 💚 Successfully saved the text file at: ${textPath}`);
  } catch (err) {
    logger.error(`Error saving the text file: ${err.message}`);
  }
}

async function fileOcr(imageFilePath) {
  const client = new vision.ImageAnnotatorClient(VISION_AUTH);

  logger.info(` 🕶️ Processing image with Google Vision: ${imageFilePath}`);
  try {
    const [result] = await client.documentTextDetection(imageFilePath);

    // Getting no text from the image

    if (!result.fullTextAnnotation) {
      return null;
    }

    logger.info(` 💚 Successfully processed image ${imageFilePath}`);
    const googleVisionText = result.fullTextAnnotation.text + "\n";
    return { googleVisionText };
  } catch (err) {
    logger.error(`Error during Google Vision OCR processing: ${err.message}`);
    // Instead of throwing an error, we'll just log it and continue
  }

  return null;
}

module.exports = { pdfOCR, fileOcr };
