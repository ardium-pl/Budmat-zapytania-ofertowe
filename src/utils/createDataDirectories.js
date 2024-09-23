const logger = require("./logger");
const {DATA_DIR, PROCESSED_DIR, TEMP_DIR} = require("../../config/constants");
const fs = require("fs").promises;

async function createDataDirectories() {
    const directories = [DATA_DIR, PROCESSED_DIR, TEMP_DIR];
    for (const dir of directories) {
        await fs.mkdir(dir, { recursive: true });
    }
    logger.info("Data directories created or verified.");
};

module.exports = {
    createDataDirectories,
};