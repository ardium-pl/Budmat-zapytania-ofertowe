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
            ['Offer Number', 'Offer Date', 'Customer Name', 'Customer Location', 'Supplier Name', 'Currency', 'Payment Terms', 'Total Quantity'],
            [processedData.offerNumber, processedData.offerDate, processedData.customer.name, processedData.customer.location, processedData.supplier.name, processedData.offerDetails.currency, processedData.offerDetails.paymentTerms, processedData.offerDetails.totalQuantity],
            [],
            ['Products'],
            ['Name of Product', 'Quantity', 'Net Price', 'Gross Price'],
            [processedData.products[0].nameOfProduct, processedData.offerDetails.totalQuantity, '', ''],
            [],
            ['Material', 'Grubość', 'Szerokość', 'Gatunek', 'Powłoka metaliczna', 'Powłoka lakiernicza', 'Producent', 'Cena netto', 'Cena brutto']
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
                product.price && product.price.net ? product.price.net : 'N/A',
                product.price && product.price.gross ? product.price.gross : 'N/A'
            ]);
        });

        const resource = { values };

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            resource,
        });

        // Formatowanie
        const requests = [
            {
                repeatCell: {
                    range: {
                        sheetId: newSheetId,
                        startRowIndex: 0,
                        endRowIndex: 1,
                        startColumnIndex: 0,
                        endColumnIndex: 9
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.8, green: 0, blue: 0 },
                            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            },
            {
                repeatCell: {
                    range: {
                        sheetId: newSheetId,
                        startRowIndex: 7,
                        endRowIndex: 8,
                        startColumnIndex: 0,
                        endColumnIndex: 9
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.8, green: 0, blue: 0 },
                            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            }
        ];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests }
        });

        logger.debug(`Arkusz utworzony i dane wstawione pomyślnie.`);
    } catch (error) {
        logger.error(`Błąd podczas tworzenia arkusza i wstawiania danych: ${error.message}`);
    }
}

module.exports = {
    createSheetAndInsertData
};