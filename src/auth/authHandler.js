const path = require('path');
const fs = require('fs').promises;
const {google} = require('googleapis');
const express = require('express');
const {createLogger}  = require('../utils/logger');
const logger = createLogger(__filename);

const TOKEN_PATH = path.join(__dirname, '../../token.json');
const SCOPES = ['https://mail.google.com/'];

let oAuth2Client;

async function authorize(credentials) {
    const {client_secret, client_id, redirect_uris} = credentials;
    oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

    logger.info(`Próba odczytu tokenu z pliku: ${TOKEN_PATH}`);

    try {
        const token = JSON.parse(await fs.readFile(TOKEN_PATH));
        oAuth2Client.setCredentials(token);

        logger.silly(`Token odczytany z pliku: ${TOKEN_PATH}`);

        oAuth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token) {
                token.refresh_token = tokens.refresh_token;
            }
            token.access_token = tokens.access_token;
            token.expiry_date = tokens.expiry_date;
            fs.writeFile(TOKEN_PATH, JSON.stringify(token));
            logger.info(`Token zaktualizowany i zapisany w pliku: ${TOKEN_PATH}`);
        });

        if (oAuth2Client.isTokenExpiring()) {
            await oAuth2Client.refreshAccessToken();
            logger.info('Token odświeżony');
        }

        logger.silly(`Autentykacja zakończona sukcesem, użyto tokenu z: ${TOKEN_PATH}`);
        return oAuth2Client;
    } catch (err) {
        logger.error(`Błąd podczas odczytu tokenu z ${TOKEN_PATH}:`, err);
        return getNewToken(oAuth2Client);
    }
}

function getNewToken(oAuth2Client) {
    return new Promise((resolve, reject) => {
        const app = express();
        const port = 3000;

        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });

        app.get('/auth/google/callback', async (req, res) => {
            const {code} = req.query;
            try {
                const {tokens} = await oAuth2Client.getToken(code);
                oAuth2Client.setCredentials(tokens);
                await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
                logger.info(`Nowy token zapisany w pliku: ${TOKEN_PATH}`);
                logger.silly(`Pełna ścieżka do pliku z tokenem: ${path.resolve(TOKEN_PATH)}`);
                res.send('Autoryzacja zakończona pomyślnie! Możesz zamknąć tę kartę.');
                resolve(oAuth2Client);
            } catch (err) {
                logger.error('Błąd podczas pobierania tokenu:', err);
                res.send('Błąd podczas pobierania tokenu.');
                reject(err);
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
    const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
    return Buffer.from(authString).toString('base64');
}

module.exports = {
    authorize,
    getNewToken,
    buildXOAuth2Token
};



// const path = require('path');
// const fs = require('fs').promises;
// const {google} = require('googleapis');
// const express = require('express');
// const {createLogger}  = require('../utils/logger');
// const logger = createLogger(__filename);
//
// const TOKEN_PATH = path.join(__dirname, '../../token.json');
// const SCOPES = ['https://mail.google.com/'];
// const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minut
//
// let oAuth2Client;
//
// async function authorize(credentials) {
//     const {client_secret, client_id, redirect_uris} = credentials;
//     oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);
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
//         await refreshTokenIfNeeded();
//
//         // Uruchom automatyczne odświeżanie tokenu
//         setInterval(refreshTokenIfNeeded, REFRESH_INTERVAL);
//
//         logger.silly(`Autentykacja zakończona sukcesem, użyto tokenu z: ${TOKEN_PATH}`);
//         return oAuth2Client;
//     } catch (err) {
//         logger.error(`Błąd podczas odczytu tokenu z ${TOKEN_PATH}:`, err);
//         return getNewToken(oAuth2Client);
//     }
// }
//
// async function refreshTokenIfNeeded() {
//     try {
//         if (oAuth2Client.isTokenExpiring()) {
//             logger.info('Token wygasa, próba odświeżenia...');
//             await oAuth2Client.refreshAccessToken();
//             logger.info('Token odświeżony pomyślnie');
//         } else {
//             logger.silly('Token nadal ważny, odświeżanie nie jest konieczne');
//         }
//     } catch (error) {
//         logger.error('Błąd podczas odświeżania tokenu:', error);
//         // Tutaj możesz dodać dodatkową logikę obsługi błędów, np. powiadomienie administratora
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