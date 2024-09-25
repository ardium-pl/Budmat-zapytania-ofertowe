// const { google } = require('googleapis');
// const dotenv = require("dotenv");
// const {createLogger}  = require('../utils/logger');
// const logger = createLogger(__filename);
// dotenv.config();
//
// const GOOGLE_SHEETS_ACCOUNT = JSON.parse(process.env.GOOGLE_SHEETS_ACCOUNT);
// const {SPREADSHEET_ID, TEMPLATE_SHEET_ID} = process.env;

// async function insertDataToGoogleSheets(rawData) {
//     const auth = new google.auth.GoogleAuth({
//         credentials: GOOGLE_SHEETS_ACCOUNT,
//         scopes: ['https://www.googleapis.com/auth/spreadsheets'],
//     });
//
//     const sheetName = rawData.supplier.name
//     const authClient = await auth.getClient();
//     const sheets = google.sheets({ version: 'v4', auth: authClient });
//
//
//     // Request to duplicate the template sheet
//     const request = {
//         spreadsheetId: SPREADSHEET_ID,
//         resource: {
//             requests: [
//                 {
//                     duplicateSheet: {
//                         sourceSheetId: TEMPLATE_SHEET_ID,
//                         insertSheetIndex: 1,
//                         newSheetName: sheetName,
//                     },
//                 },
//             ],
//         },
//     };
//
//     try {
//         const response = await sheets.spreadsheets.batchUpdate(request);
//         logger.info('Duplicated Sheet ID:', sheetName);
//     } catch (err) {
//         logger.error('Error duplicating sheet:', err);
//     }
// }
//
// module.exports = {
//     insertDataToGoogleSheets,
// };

const {google} = require('googleapis');
const dotenv = require("dotenv");
const fs = require('fs').promises;
const path = require('path');
const {createLogger} = require('../utils/logger');
const logger = createLogger(__filename);
dotenv.config();


const GOOGLE_SHEETS_ACCOUNT = JSON.parse(process.env.GOOGLE_SHEETS_ACCOUNT);
const {SPREADSHEET_ID, TEMPLATE_SHEET_ID} = process.env;

async function createSheetAndInsertData(emailDir) {
    const emailId = path.basename(emailDir).replace('email_', '');
    const processedDataPath = path.join(emailDir, `processed_offer_${emailId}.json`);


    try {
        // Check if the processed data file exists
        await fs.access(processedDataPath);
        logger.debug(` Found processed data file: ${processedDataPath}`);

        // Read and parse the processed data
        const rawData = await fs.readFile(processedDataPath, 'utf8');
        const processedData = JSON.parse(rawData);

        // Authenticate with Google Sheets API
        const auth = new google.auth.GoogleAuth({
            credentials: GOOGLE_SHEETS_ACCOUNT,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({version: 'v4', auth});

        // Create a new Google Sheet
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
        logger.info(`Duplicated Sheet ID: ${newSheetId}`);

        // Prepare the data to be inserted
        const values = [
            ['Offer Number', 'Offer Date', 'Customer Name', 'Customer Location', 'Supplier Name', 'Currency', 'Payment Terms', 'Total Quantity'],
            [processedData.offerNumber, processedData.offerDate, processedData.customer.name, processedData.customer.location, processedData.supplier.name, processedData.offerDetails.currency, processedData.offerDetails.paymentTerms, processedData.offerDetails.totalQuantity],
            [],
            ['Products'],
            ['Name of Product', 'Quantity', 'Net Price', 'Gross Price']
        ];

        processedData.products.forEach(product => {
            values.push([
                product.nameOfProduct,
                product.quantity,
                product.price.net,
                product.price.gross
            ]);
        });

        const resource = {
            values,
        };

        // Insert data into the new Google Sheet
        const result = await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            resource,
        });

        logger.debug(`Data inserted into Google Sheets: ${result.data.updatedCells} cells updated.`);
    } catch (error) {
        logger.error(`Error creating sheet and inserting data to Google Sheets: ${error.message}`);
    }
}

module.exports = {
    createSheetAndInsertData
};
