const vision = require("@google-cloud/vision");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const { convertPdfToImages } = require("../../utils/convertPdfToImage.js");
const { deleteFile } = require("../../utils/deleteFile.js");
dotenv.config();

const VISION_AUTH = {
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY
    }
};

async function pdfOCR(pdfFilePath) {
    const inputPdfFolder = "./attachments";
    const imagesFolder = "./images";
    const outputTextFolder = "./processed_attachments/pdf";
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
                console.log(`🖼️ Converted PDF to images: ${imageFilePaths.join(', ')}`);

                if (imageFilePaths.length === 0) {
                    throw new Error(" 😡 No images were generated from the PDF");
                }

                let googleVisionText = '';

                for (const imageFilePath of imageFilePaths) {
                    console.log(` 🕶️ Processing image with Google Vision: ${imageFilePath}`);
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

                console.log(` 💚 Successfully processed ${pdfFilePath}`);
            } catch (err) {
                console.error(`Error processing ${pdfFilePath}):`, err);
            } finally {
                // Clean up temporary files
                // if (fs.existsSync(pdfFilePath)) {
                //     console.log(`Deleting temporary PDF: ${pdfFilePath}`);
                //     deleteFile(pdfFilePath);
                // }
                const imagePaths = fs.readdirSync(imagesFolder)
                    .filter(f => f.startsWith(fileBaseName + '-'))
                    .map(f => path.join(imagesFolder, f));
                imagePaths.forEach(imagePath => {
                    console.log(`Deleting temporary image: ${imagePath}`);
                    deleteFile(imagePath);
                });
            }
        

        return results;
    } catch (err) {
        console.error("Error in pdfOCR:", err);
        throw err;
    }
}

module.exports = { pdfOCR };
