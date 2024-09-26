const imaps = require('imap-simple');
const { processNewEmails, processEmail } = require('./emailProcessor');
const { buildXOAuth2Token, refreshTokenIfNeeded } = require('../auth/authHandler');
const { EMAIL_ADDRESS } = require('../../config/constants');
const {saveToken} = require('../auth/authHandler.js')
const {createLogger}  = require('../utils/logger');
const logger = createLogger(__filename);

async function startImapListener(auth) {
    const getAccessToken = async () => {
        await refreshTokenIfNeeded();
        return auth.credentials.access_token;
    };

    const startConnection = async () => {
        const accessToken = await getAccessToken();
        logger.info("Nowy accessToken: " + accessToken);

        if (!accessToken) {
            logger.error('Nie udało się uzyskać tokenu dostępu. Przerywam próbę połączenia.');
            return;
        }

        const xoauth2Token = buildXOAuth2Token(EMAIL_ADDRESS, accessToken);
        logger.info(`Wygenerowany token XOAUTH2 (pierwsze 10 znaków): ${xoauth2Token.substring(0, 10)}...`);

        const config = {
            imap: {
                user: EMAIL_ADDRESS,
                xoauth2: xoauth2Token,
                host: 'imap.gmail.com',
                port: 993,
                tls: true,
                tlsOptions: { rejectUnauthorized: false },
                authTimeout: 30000,
            },
            onmail: async () => {
                logger.info('Nowy email otrzymany. Przetwarzanie...');
                try {
                    const connection = await imaps.connect(config);
                    await processNewEmail(connection);
                    await connection.end();
                } catch (error) {
                    logger.error('Błąd podczas przetwarzania nowego emaila:', error);
                }
            },
        };

        try {
            logger.info(`Próba połączenia z IMAP używając adresu: ${EMAIL_ADDRESS}`);
            const connection = await imaps.connect(config);
            logger.info('Połączono z serwerem IMAP');

            await processNewEmails(connection);

            logger.info('Nasłuchiwanie nowych emaili...');
            connection.imap.on('mail', config.onmail);

            connection.imap.on('error', (err) => {
                logger.error('Błąd połączenia IMAP:', err);
                setTimeout(() => startImapListener(auth), 60000);
            });
        } catch (err) {
            logger.error('Błąd podczas próby połączenia IMAP:', err);
            setTimeout(() => startImapListener(auth), 60000);
        }
    };

    await startConnection();

    // Update the IMAP connection when tokens are refreshed
    auth.on('tokens', async (tokens) => {
        logger.info('Otrzymano nowe tokeny');
        await saveToken(tokens);
        await startConnection();
    });
}

async function processNewEmail(connection) {
    try {
        await connection.openBox('INBOX');
        logger.info('Otwarto INBOX');

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true,
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        logger.info(`Znaleziono ${messages.length} nowych wiadomości`);

        for (const message of messages) {
            try {
                await processEmail(connection, message);
            } catch (error) {
                logger.error('Błąd podczas przetwarzania wiadomości:', error);
            }
        }

        logger.info('Zakończono przetwarzanie nowych wiadomości');
    } catch (error) {
        logger.error('Błąd w processNewEmail:', error);
    }
}

module.exports = {
    startImapListener
};