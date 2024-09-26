// const path = require('path');
// const fs = require('fs').promises;
// const {google} = require('googleapis');
// const express = require('express');
// const {createLogger}  = require('../utils/logger');
// const logger = createLogger(__filename);
//
// const TOKEN_PATH = path.join(__dirname, '../../token.json');
// const SCOPES = ['https://mail.google.com/'];
//
// let oAuth2Client;
//
// async function authorize(credentials) {
//     const {client_secret, client_id, redirect_uris} = credentials;
//     oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);
//
//     logger.info(`Próba odczytu tokenu z pliku: ${TOKEN_PATH}`);
//
//     try {
//         const token = JSON.parse(await fs.readFile(TOKEN_PATH));
//         oAuth2Client.setCredentials(token);
//
//         logger.silly(`Token odczytany z pliku: ${TOKEN_PATH}`);
//
//         oAuth2Client.on('tokens', (tokens) => {
//             if (tokens.refresh_token) {
//                 token.refresh_token = tokens.refresh_token;
//             }
//             token.access_token = tokens.access_token;
//             token.expiry_date = tokens.expiry_date;
//             fs.writeFile(TOKEN_PATH, JSON.stringify(token));
//             logger.info(`Token zaktualizowany i zapisany w pliku: ${TOKEN_PATH}`);
//         });
//
//         if (oAuth2Client.isTokenExpiring()) {
//             await oAuth2Client.refreshAccessToken();
//             logger.info('Token odświeżony');
//         }
//
//         logger.silly(`Autentykacja zakończona sukcesem, użyto tokenu z: ${TOKEN_PATH}`);
//         return oAuth2Client;
//     } catch (err) {
//         logger.error(`Błąd podczas odczytu tokenu z ${TOKEN_PATH}:`, err);
//         return getNewToken(oAuth2Client);
//     }
// }
//
// function getNewToken(oAuth2Client) {
//     return new Promise((resolve, reject) => {
//         const app = express();
//         const port = 3000;
//
//         const authUrl = oAuth2Client.generateAuthUrl({
//             access_type: 'offline',
//             scope: SCOPES,
//         });
//
//         app.get('/auth/google/callback', async (req, res) => {
//             const {code} = req.query;
//             try {
//                 const {tokens} = await oAuth2Client.getToken(code);
//                 oAuth2Client.setCredentials(tokens);
//                 await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
//                 logger.info(`Nowy token zapisany w pliku: ${TOKEN_PATH}`);
//                 logger.silly(`Pełna ścieżka do pliku z tokenem: ${path.resolve(TOKEN_PATH)}`);
//                 res.send('Autoryzacja zakończona pomyślnie! Możesz zamknąć tę kartę.');
//                 resolve(oAuth2Client);
//             } catch (err) {
//                 logger.error('Błąd podczas pobierania tokenu:', err);
//                 res.send('Błąd podczas pobierania tokenu.');
//                 reject(err);
//             }
//         });
//
//         app.listen(port, () => {
//             logger.info(`Serwer nasłuchuje na porcie: ${port}`);
//             logger.info('URL aplikacji: ' + authUrl);
//             logger.warn(`Otwórz ten URL w przeglądarce, aby autoryzować aplikację: ${authUrl}`);
//         });
//     });
// }
//
// function buildXOAuth2Token(user, accessToken) {
//     const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
//     return Buffer.from(authString).toString('base64');
// }
//
// module.exports = {
//     authorize,
//     getNewToken,
//     buildXOAuth2Token
// };



const path = require('path');
const fs = require('fs').promises;
const {google} = require('googleapis');
const express = require('express');
const {createLogger}  = require('../utils/logger');
const logger = createLogger(__filename);


// Definiujemy bazową ścieżkę do wolumenu
const VOLUME_PATH = '/app/processed_attachments';

// Upewniamy się, że używamy tylko jednego poziomu 'processed_attachments'
const TOKEN_PATH = path.join(VOLUME_PATH, 'token.json');

const SCOPES = ['https://mail.google.com/'];
const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minut

let oAuth2Client;

async function ensureDirectoryExists(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        logger.info(`Katalog ${dirPath} został utworzony lub już istnieje`);
    } catch (error) {
        logger.error(`Błąd podczas tworzenia katalogu ${dirPath}:`, error);
        throw error;
    }
}

async function saveToken(tokens) {
    try {
        await ensureDirectoryExists(path.dirname(TOKEN_PATH));
        await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
        logger.info(`Token zapisany w pliku: ${TOKEN_PATH}`);
    } catch (error) {
        logger.error(`Błąd podczas zapisywania tokenu:`, error);
        throw error;
    }
}

async function authorize(credentials) {
    const {client_secret, client_id, redirect_uris} = credentials;
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

    logger.info(`Próba odczytu tokenu z pliku: ${TOKEN_PATH}`);

    try {
        const token = JSON.parse(await fs.readFile(TOKEN_PATH));
        oAuth2Client.setCredentials(token);

        logger.info(`Token odczytany z pliku: ${TOKEN_PATH}`);
        logger.info(`Typ access_token: ${typeof token.access_token}`);
        logger.info(`Długość access_token: ${token.access_token.length}`);

        if (!token.refresh_token) {
            logger.warn('Brak refresh tokenu. Rozpoczynam proces uzyskiwania nowego tokenu.');
            return getNewToken(oAuth2Client);
        }

        const isTokenValid = await validateToken(oAuth2Client);
        if (!isTokenValid) {
            logger.warn('Token jest nieważny. Rozpoczynam proces uzyskiwania nowego tokenu.');
            return getNewToken(oAuth2Client);
        }

        oAuth2Client.on('tokens', async (tokens) => {
            logger.info('Otrzymano nowe tokeny');
            logger.info(`Typ nowego access_token: ${typeof tokens.access_token}`);
            logger.info(`Długość nowego access_token: ${tokens.access_token.length}`);
            await saveToken(tokens);
            logger.info(`Token odświeżony. Nowa data wygaśnięcia: ${new Date(tokens.expiry_date).toLocaleString()}`);
        });

        // Uruchom automatyczne odświeżanie tokenu
        setInterval(refreshTokenIfNeeded, REFRESH_INTERVAL);

        logger.info(`Autentykacja zakończona sukcesem, użyto tokenu z: ${TOKEN_PATH}`);
        return oAuth2Client;
    } catch (err) {
        logger.warn(`Nie znaleziono istniejącego tokenu lub token jest nieprawidłowy. Rozpoczynam proces uzyskiwania nowego tokenu.`);
        logger.error(`Błąd podczas odczytu tokenu z ${TOKEN_PATH}:`, err);
        return getNewToken(oAuth2Client);
    }
}

async function validateToken(auth) {
    try {
        await auth.getAccessToken();
        return true;
    } catch (error) {
        logger.error('Błąd podczas walidacji tokenu:', error);
        return false;
    }
}

async function refreshTokenIfNeeded() {
    try {
        if (oAuth2Client.isTokenExpiring()) {
            logger.info('Token wygasa, próba odświeżenia...');
            const { credentials } = await oAuth2Client.refreshAccessToken();
            oAuth2Client.setCredentials(credentials);
            await saveToken(credentials);
            logger.info('Token odświeżony pomyślnie');
            logger.info(`Typ odświeżonego access_token: ${typeof credentials.access_token}`);
            logger.info(`Długość odświeżonego access_token: ${credentials.access_token.length}`);
        } else {
            logger.silly('Token nadal ważny, odświeżanie nie jest konieczne');
        }
        return true;
    } catch (error) {
        logger.error('Błąd podczas odświeżania tokenu:', error);
        return false;
    }
}

function getNewToken(oAuth2Client) {
    return new Promise((resolve) => {
        const app = express();
        const port = 3000;

        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'  // Wymusza zapytanie o zgodę, co powinno zawsze zwrócić refresh token
        });

        logger.info(`Serwer nasłuchuje na porcie: ${port}`);
        logger.info('URL aplikacji: ' + authUrl);
        logger.warn(`Otwórz ten URL w przeglądarce, aby autoryzować aplikację: ${authUrl}`);

        app.get('/auth/google/callback', async (req, res) => {
            const {code} = req.query;
            try {
                const {tokens} = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);
                await saveToken(tokens);
                logger.info(`Nowy token zapisany w pliku: ${TOKEN_PATH}`);
                logger.silly(`Pełna ścieżka do pliku z tokenem: ${path.resolve(TOKEN_PATH)}`);
                res.send('Autoryzacja zakończona pomyślnie! Możesz zamknąć tę kartę.');
                resolve(oAuth2Client);
            } catch (err) {
                logger.error('Błąd podczas pobierania tokenu:', err);
                res.send('Błąd podczas pobierania tokenu. Spróbuj ponownie.');
                resolve(null);
            }
        });

        app.listen(port, () => {
            logger.info(`Serwer nasłuchuje na porcie: ${port}`);
            logger.info('URL aplikacji: ' + authUrl);
            logger.warn(`Otwórz ten URL w przeglądarce, aby autoryzować aplikację: ${authUrl}`);
        });
    });
}

function buildXOAuth2Token(user, accessToken) {
    if (typeof user !== 'string' || typeof accessToken !== 'string') {
        logger.error(`Nieprawidłowe dane wejściowe dla buildXOAuth2Token. User: ${typeof user}, AccessToken: ${typeof accessToken}`);
        return ''; // Zwracamy pusty string w przypadku błędnych danych wejściowych
    }
    const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
    const token = Buffer.from(authString).toString('base64');
    logger.info(`Wygenerowany token XOAUTH2 (pierwsze 10 znaków): ${token.substring(0, 10)}...`);
    return token;
}

module.exports = {
    authorize,
    saveToken,
    getNewToken,
    buildXOAuth2Token,
    refreshTokenIfNeeded
};