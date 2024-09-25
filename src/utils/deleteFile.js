const fs = require("fs");
const {createLogger}  = require('../utils/logger');
const logger = createLogger(__filename);

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
