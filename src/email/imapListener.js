const imaps = require('imap-simple');
const { processNewEmails, processEmail } = require('./emailProcessor');
const { buildXOAuth2Token, refreshTokenIfNeeded } = require('../auth/authHandler');
const { EMAIL_ADDRESS } = require('../../config/constants');
const {createLogger}  = require('../utils/logger');
const logger = createLogger(__filename);

async function startImapListener(auth) {
    const getAccessToken = async () => {
        const refreshSuccessful = await refreshTokenIfNeeded();
        if (refreshSuccessful) {
            logger.info('Token sprawdzony i odświeżony, jeśli było to konieczne');
            return auth.credentials.access_token;
        } else {
            logger.error('Nie udało się odświeżyć tokenu');
            return null;
        }
    };

    const config = {
        imap: {
            user: EMAIL_ADDRESS,
            xoauth2: async () => {
                const accessToken = await getAccessToken();
                if (!accessToken) {
                    logger.error('Brak ważnego tokenu dostępu');
                    return '';  // Zwracamy pusty string zamiast null
                }
                const token = buildXOAuth2Token(EMAIL_ADDRESS, accessToken);
                logger.info(`Wygenerowany token XOAUTH2 (pierwsze 10 znaków): ${token.substring(0, 10)}...`);
                return token;
            },
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
            },
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

    async function attemptConnection() {
        try {
            logger.info(`Próba połączenia z IMAP używając adresu: ${EMAIL_ADDRESS}`);
            const connection = await imaps.connect(config);
            logger.info('Połączono z serwerem IMAP');

            // Początkowe skanowanie nieprzeczytanych wiadomości
            await processNewEmails(connection);

            logger.info('Nasłuchiwanie nowych emaili...');

            // Utrzymuj połączenie otwarte, aby nasłuchiwać nowe emaile
            connection.imap.on('mail', config.onmail);

            connection.imap.on('error', (err) => {
                logger.error('Błąd połączenia IMAP:', err);
                setTimeout(attemptConnection, 60000); // Próba ponownego połączenia po 1 minucie
            });
        } catch (err) {
            logger.error('Błąd podczas próby połączenia IMAP:', err);
            setTimeout(attemptConnection, 60000); // Próba ponownego połączenia po 1 minucie
        }
    }

    attemptConnection();
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