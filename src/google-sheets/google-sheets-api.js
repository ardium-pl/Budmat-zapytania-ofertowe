const { google } = require('googleapis');
const dotenv = require("dotenv");
const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../utils/logger');
const logger = createLogger(__filename);
dotenv.config();

const GOOGLE_SHEETS_ACCOUNT = JSON.parse(process.env.GOOGLE_SHEETS_ACCOUNT);
const { SPREADSHEET_ID, TEMPLATE_SHEET_ID } = process.env;

async function createSheetAndInsertData(emailDir) {
    const emailId = path.basename(emailDir).replace('email_', '');
    const processedDataPath = path.join(emailDir, `processed_offer_${emailId}.json`);

    try {
        const rawData = await fs.readFile(processedDataPath, 'utf8');
        const processedData = JSON.parse(rawData);

        const auth = new google.auth.GoogleAuth({
            credentials: GOOGLE_SHEETS_ACCOUNT,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const sheetName = processedData.supplier.name;
        const duplicateRequest = {
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [
                    {
                        duplicateSheet: {
                            sourceSheetId: TEMPLATE_SHEET_ID,
                            insertSheetIndex: 1,
                            newSheetName: sheetName,
                        },
                    },
                ],
            },
        };

        const duplicateResponse = await sheets.spreadsheets.batchUpdate(duplicateRequest);
        const newSheetId = duplicateResponse.data.replies[0].duplicateSheet.properties.sheetId;

        const values = [
            [processedData.supplier.name, processedData.offerDetails.currency, processedData.offerDetails.deliveryTerms, processedData.offerDetails.deliveryDate, processedData.offerDetails.paymentTerms],
            [],
            [],
            [],
            [],
            [],
        ];

        processedData.products.forEach(product => {
            values.push([
                product.material || 'undefined',
                product.thickness,
                product.width,
                product.grade,
                product.surface || '',
                '',  // Powłoka lakiernicza - brak w JSON
                '',  // Producent - brak w JSON
                product.price || 'N/A',
            ]);
        });

        const resource = { values };

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A2`,
            valueInputOption: 'RAW',
            resource,
        });

        logger.debug(`Arkusz utworzony i dane wstawione pomyślnie.`);
    } catch (error) {
        logger.error(`Błąd podczas tworzenia arkusza i wstawiania danych: ${error.message}`);
    }
}

module.exports = {
    createSheetAndInsertData
};