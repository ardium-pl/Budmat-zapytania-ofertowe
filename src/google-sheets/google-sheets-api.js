const { google } = require('googleapis');
const dotenv = require("dotenv");
const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../utils/logger');
const logger = createLogger(__filename);
dotenv.config();

const GOOGLE_SHEETS_ACCOUNT = JSON.parse(process.env.GOOGLE_SHEETS_ACCOUNT);
const { SPREADSHEET_ID, TEMPLATE_SHEET_ID } = process.env;

async function createUniqueSheetName(sheets, baseName) {
    let sheetName = baseName;
    let counter = 1;
    const existingSheets = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties.title'
    });

    const existingNames = existingSheets.data.sheets.map(sheet => sheet.properties.title);

    while (existingNames.includes(sheetName)) {
        sheetName = `${baseName} - Copy ${counter}`;
        counter++;
    }

    return sheetName;
}

function validateProcessedData(data) {
    const requiredFields = ['offerNumber', 'offerDate', 'customer', 'supplier', 'offerDetails'];
    const missingFields = requiredFields.filter(field => !data[field]);

    if (missingFields.length > 0) {
        logger.warn(`Brakujące pola w danych: ${missingFields.join(', ')}`);
    }

    if (!data.products || !Array.isArray(data.products)) {
        logger.warn('Brak tablicy produktów lub nieprawidłowy format');
        data.products = [];
    }

    return {
        isValid: missingFields.length === 0 && data.products.length > 0,
        missingFields,
        productsCount: data.products.length
    };
}

async function createSheetAndInsertData(emailDir) {
    const emailId = path.basename(emailDir).replace('email_', '');
    const processedDataPath = path.join(emailDir, `processed_offer_${emailId}.json`);

    try {
        logger.info(`Próba odczytu pliku: ${processedDataPath}`);
        const rawData = await fs.readFile(processedDataPath, 'utf8');
        logger.debug(`Zawartość surowych danych: ${rawData}`);

        let processedData;
        try {
            processedData = JSON.parse(rawData);
        } catch (parseError) {
            logger.error(`Błąd parsowania JSON: ${parseError.message}`);
            logger.debug(`Problematyczne dane: ${rawData}`);
            throw new Error('Nieprawidłowy format JSON');
        }

        logger.debug(`Struktura przetworzonych danych: ${JSON.stringify(Object.keys(processedData), null, 2)}`);

        const validationResult = validateProcessedData(processedData);
        logger.info(`Wynik walidacji: ${JSON.stringify(validationResult)}`);
        if (!validationResult.isValid) {
            logger.warn('Dane nie przeszły pełnej walidacji, ale kontynuuję z dostępnymi informacjami');
        }

        const auth = new google.auth.GoogleAuth({
            credentials: GOOGLE_SHEETS_ACCOUNT,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const baseSheetName = processedData.supplier?.name || 'Nowy arkusz';
        const sheetName = await createUniqueSheetName(sheets, baseSheetName);

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
            [
                processedData.offerNumber || 'N/A',
                processedData.offerDate || 'N/A',
                processedData.customer?.name || 'N/A',
                processedData.customer?.location || 'N/A',
                processedData.supplier?.name || 'N/A',
                processedData.offerDetails?.currency || 'N/A',
                processedData.offerDetails?.paymentTerms || 'N/A',
                processedData.offerDetails?.totalQuantity || 'N/A'
            ],
            [],
            ['Products'],
            ['Name of Product', 'Quantity', 'Net Price', 'Gross Price'],
        ];

        if (processedData.products && processedData.products.length > 0) {
            processedData.products.forEach(product => {
                values.push([
                    product.nameOfProduct || 'N/A',
                    product.quantity || 'N/A',
                    product.price?.net || 'N/A',
                    product.price?.gross || 'N/A'
                ]);
            });
        } else {
            values.push(['Brak danych o produktach', '', '', '']);
        }

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
                        startRowIndex: 4,
                        endRowIndex: 5,
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

        logger.debug(`Arkusz "${sheetName}" utworzony i dane wstawione pomyślnie.`);
    } catch (error) {
        logger.error(`Błąd podczas tworzenia arkusza i wstawiania danych: ${error.message}`);
        logger.debug(`Stos błędu: ${error.stack}`);
    }
}

module.exports = {
    createSheetAndInsertData
};