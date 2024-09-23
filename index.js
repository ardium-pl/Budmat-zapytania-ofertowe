const fs = require("fs").promises;
const {authorize} = require("./src/auth/authHandler");
const {startImapListener} = require("./src/email/imapListener");
const {resetEmailsAndAttachments} = require("./src/email/resetEmailsAndAttachments");
const logger = require("./src/utils/logger");
const {createDataDirectories} = require("./src/utils/createDataDirectories");

async function main() {
    try {

        await createDataDirectories();

        const CREDENTIALS = {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            redirect_uris: process.env.REDIRECT_URIS,
        };
        const oAuth2Client = await authorize(CREDENTIALS);

        // Sprawdź, czy argument --reset jest obecny
        const shouldReset = process.argv.includes("--reset");

        if (shouldReset) {
            logger.info("Resetting emails and removing attachment folders...");
            await resetEmailsAndAttachments(oAuth2Client);
            logger.info("Reset completed.");
        } else {
            // Normalny tryb pracy - nasłuchiwanie i przetwarzanie nowych e-maili
            await startImapListener(oAuth2Client);
        }
    } catch (error) {
        logger.error("Error occurred:", error);
    }
}

main();
