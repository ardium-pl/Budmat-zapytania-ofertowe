const fs = require("fs");
const logger = require("./logger");

async function deleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info('File deleted', { filePath });
        } else {
            logger.error(`File not found: ${filePath}`);
        }
    } catch (err) {
        logger.error(`Error deleting file ${filePath}:`, err);
    }
}

module.exports = {deleteFile};
