const { Poppler } = require("node-poppler");
const path = require("path");
const fs = require("fs");
const { replacePolishCharacters } = require("./fileUtils.js");
const logger = require("./logger.js");

async function convertPdfToImages(pdfFilePath, saveFolder) {
    const { default: camelcase } = await import("camelcase");
    logger.info(`Starting conversion of PDF: ${pdfFilePath}`);
    const poppler = new Poppler();
    const outputPrefix = replacePolishCharacters(
        path.basename(pdfFilePath, path.extname(pdfFilePath))
    );
    const outputFilePath = path.join(saveFolder, `${outputPrefix}`);
    const pdfInfo = {};
    
    if (!fs.existsSync(saveFolder)) {
        fs.mkdirSync(saveFolder, { recursive: true });
    }

    try {
        logger.info(`Getting PDF info for: ${pdfFilePath}`);
        const ret = await poppler.pdfInfo(pdfFilePath);

        ret.split('\n').map(r => r.split(': ')).forEach(r => {
            if (r.length > 1) {
              pdfInfo[camelcase(r[0])] = r[1].trim();
            }
        });

        logger.info(`PDF info: ${JSON.stringify(pdfInfo)}`);

        const options = {
            firstPageToConvert: 1,
            lastPageToConvert: parseInt(pdfInfo.pages),
            pngFile: true,
        };

        logger.info(`Converting PDF to images with options: ${JSON.stringify(options)}`);
        await poppler.pdfToCairo(pdfFilePath, outputFilePath, options);

        const imagePaths = [];
        for (let i = options.firstPageToConvert; i <= options.lastPageToConvert; i++) {
            const imagePath = `${outputFilePath}-${i}.png`;
            if (fs.existsSync(imagePath)) {
                imagePaths.push(imagePath);
            } else {
                logger.warn(`Expected image file not found: ${imagePath}`);
            }
        }

        logger.info(`Converted PDF to ${imagePaths.length} images`);
        return imagePaths;
    } catch (err) {
        logger.error("Error converting PDF to image:", err);
        throw err;
    }
}

module.exports = { convertPdfToImages };