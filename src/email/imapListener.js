const imaps = require('imap-simple');
const {processNewEmails, processEmail} = require('./emailProcessor');
const {buildXOAuth2Token, refreshTokenIfNeeded} = require('../auth/authHandler');
const {EMAIL_ADDRESS} = require('../../config/constants');
const {saveToken} = require('../auth/authHandler.js');
const {createLogger} = require('../utils/logger');
const logger = createLogger(__filename);

const RECONNECT_DELAY = 60000; // 1 minute


let currentConnection = null;
let isManuallyClosingConnection = false; // Flag to track manual closing

async function startImapListener(auth) {
    const getAccessToken = async () => {
        await refreshTokenIfNeeded();
        return auth.credentials.access_token;
    };

    const closeCurrentConnection = () => {
        if (currentConnection) {
            logger.info('Closing the existing IMAP connection...');
            isManuallyClosingConnection = true;  // Set the flag before closing the connection
            currentConnection.end();
            currentConnection = null;
        }
    };

    const startConnection = async () => {
        try {
            const accessToken = await getAccessToken();

            if (!accessToken) {
                logger.error('Failed to obtain access token. Aborting connection attempt.');
                setTimeout(() => startConnection(), RECONNECT_DELAY);
                return;
            }

            const xoauth2Token = buildXOAuth2Token(EMAIL_ADDRESS, accessToken);
            logger.info(`Generated XOAUTH2 token (first 10 characters): ${xoauth2Token.substring(0, 10)}...`);

            const config = {
                imap: {
                    user: EMAIL_ADDRESS,
                    xoauth2: xoauth2Token,
                    host: 'imap.gmail.com',
                    port: 993,
                    tls: true,
                    tlsOptions: {rejectUnauthorized: false},
                    authTimeout: 30000,
                    keepalive: {
                        interval: 10000,
                        idleInterval: 300000,
                        forceNoop: true
                    }
                },
                onmail: async () => {
                    logger.info('New email received. Processing...');
                    try {
                        await processNewEmail(currentConnection);
                    } catch (error) {
                        logger.error('Error processing new email:', error);
                    }
                },
            };

            closeCurrentConnection(); // Close the previous connection before creating a new one

            logger.info(`Attempting to connect to IMAP using address: ${EMAIL_ADDRESS}`);
            currentConnection = await imaps.connect(config);
            logger.info('Connected to IMAP server');

            // Reset the manual closure flag when the connection is successfully established
            isManuallyClosingConnection = false;

            currentConnection.on('error', (err) => {
                logger.error('IMAP connection error:', err);
                if (currentConnection) currentConnection.end();
                currentConnection = null;
                setTimeout(() => startConnection(), RECONNECT_DELAY);
            });

            currentConnection.on('close', () => {
                if (!isManuallyClosingConnection) {
                    // Only reconnect if the closure was not intentional
                    logger.warn('IMAP connection closed unexpectedly, attempting to reconnect...');
                    currentConnection = null;
                    setTimeout(() => startConnection(), RECONNECT_DELAY);
                } else {
                    logger.info('IMAP connection closed manually.');
                    isManuallyClosingConnection = false; // Reset the flag
                }
            });

            await processNewEmails(currentConnection);

            logger.info('Listening for new emails...');
            currentConnection.imap.on('mail', config.onmail);

        } catch (err) {
            logger.error('Error during IMAP connection attempt:', err);
            setTimeout(() => startConnection(), RECONNECT_DELAY);
        }
    };

    await startConnection();

    // Update the IMAP connection when tokens are refreshed
    auth.on('tokens', async (tokens) => {
        logger.info('Received new tokens');
        await saveToken(tokens);
        closeCurrentConnection(); // Close the connection before starting a new one
        await startConnection();  // Start a new connection after token refresh
    });
}

async function processNewEmail(connection) {
    try {
        await connection.openBox('INBOX');
        logger.info('Opened INBOX');

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true,
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        logger.info(`Found ${messages.length} new messages`);

        for (const message of messages) {
            try {
                await processEmail(connection, message);
            } catch (error) {
                logger.error('Error processing message:', error);
            }
        }

        logger.info('Finished processing new messages');
    } catch (error) {
        logger.error('Error in processNewEmail:', error);
    }
}

module.exports = {
    startImapListener
};