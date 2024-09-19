const vision = require("@google-cloud/vision");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const { convertPdfToImages } = require("../../utils/convertPdfToImage.js");
const { deleteFile } = require("../../utils/deleteFile.js");
const logger = require("../../utils/logger.js");
const { DATA_DIR } = require("../../../config/constants");
dotenv.config();

const VISION_AUTH = {
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY
    }
};

async function pdfOCR(pdfFilePath) {
    const inputPdfFolder = path.join(DATA_DIR, 'attachments');
    const imagesFolder = path.join(DATA_DIR, 'images');
    const outputTextFolder = path.join(DATA_DIR, 'processed_attachments/pdf');
    const fileBaseName = path.basename(pdfFilePath, '.pdf');

    [inputPdfFolder, imagesFolder, outputTextFolder].forEach(folder => {
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, {recursive: true});
        }
    });

    const client = new vision.ImageAnnotatorClient(VISION_AUTH);

    try {
        const results = []; 


            try {
                const imageFilePaths = await convertPdfToImages(pdfFilePath, imagesFolder);
                logger.info(`🖼️ Converted PDF to images: ${imageFilePaths.join(', ')}`);

                if (imageFilePaths.length === 0) {
                    logger.error("No images were generated from the PDF");
                    return [];
                }
                let googleVisionText = '';

                for (const imageFilePath of imageFilePaths) {
                    logger.info(` 🕶️ Processing image with Google Vision: ${imageFilePath}`);
                    const [result] = await client.documentTextDetection(imageFilePath);
                    if (result.fullTextAnnotation) {
                        googleVisionText += result.fullTextAnnotation.text + '\n';
                    }
                }

                results.push({
                    googleVisionText: googleVisionText,
                });

                // Save results
                const saveData = (folder, text) => {
                    const fileNameWithoutExt = path.basename(pdfFilePath, '.pdf');
                    const textPath = path.join(folder, `${fileNameWithoutExt}.txt`);
                    fs.writeFileSync(textPath, text, "utf8");
                };


                saveData(outputTextFolder, googleVisionText);

                logger.info(` 💚 Successfully processed ${pdfFilePath}`);
            } catch (err) {
                logger.error(`Error processing ${pdfFilePath}):`, err);
            } finally {
                // Clean up temporary files
                // if (fs.existsSync(pdfFilePath)) {
                //     console.log(`Deleting temporary PDF: ${pdfFilePath}`);
                //     deleteFile(pdfFilePath);
                // }
                const imagePaths = fs.readdirSync(imagesFolder)
                    .filter(f => f.startsWith(fileBaseName + '-'))
                    .map(f => path.join(imagesFolder, f));
                imagePaths.forEach(async imagePath => {
                    logger.warn(`Deleting temporary image: ${imagePath}`);
                    await deleteFile(imagePath);
                });
            }
        

        return results;
    } catch (err) {
        logger.error("Error in pdfOCR:", err);
        throw err;
    }
}

module.exports = { pdfOCR };
