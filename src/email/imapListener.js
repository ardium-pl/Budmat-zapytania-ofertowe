const imaps = require('imap-simple');
const { processNewEmails, processEmail } = require('./emailProcessor');
const { buildXOAuth2Token } = require('../auth/authHandler');
const { EMAIL_ADDRESS } = require('../../config/constants');
const logger = require('../utils/logger');

async function startImapListener(auth) {
    const getAccessToken = async () => {
        if (auth.isTokenExpiring()) {
            await auth.refreshAccessToken();
            logger.info('Token refreshed');
        }
        return auth.credentials.access_token;
    };

    const accessToken = await getAccessToken();
    const xoauth2Token = buildXOAuth2Token(EMAIL_ADDRESS, accessToken);

    const config = {
        imap: {
            user: EMAIL_ADDRESS,
            xoauth2: xoauth2Token,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
            },
            authTimeout: 30000,
        },
        onmail: async () => {
            logger.info('New email received. Processing...');
            try {
                const connection = await imaps.connect(config);
                await processNewEmail(connection);
                await connection.end();
            } catch (error) {
                logger.error('Error processing new email:', error);
            }
        },
    };

    try {
        const connection = await imaps.connect(config);
        logger.info('Connected to IMAP server');

        // Initial scan of unseen messages
        await processNewEmails(connection);

        logger.info('Listening for new emails...');

        // Keep the connection open to listen for new emails
        connection.imap.on('mail', config.onmail);
    } catch (err) {
        logger.error('IMAP connection error:', err);
    }
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