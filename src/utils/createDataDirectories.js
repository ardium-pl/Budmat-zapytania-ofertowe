const {createLogger} = require('../utils/logger');
const logger = createLogger(__filename);
const {DATA_DIR, PROCESSED_DIR, TEMP_DIR} = require("../../config/constants");
const fs = require("fs").promises;

async function createDataDirectories() {
    const directories = [DATA_DIR, PROCESSED_DIR, TEMP_DIR];
    try {
        for (const dir of directories) {
            await fs.mkdir(dir, {recursive: true});
        }
        logger.info("Data directories created or verified.");
    } catch (err) {
        logger.error('Error while creating directories:', err);
        throw err;
    }
}

module.exports = {
    createDataDirectories,
};