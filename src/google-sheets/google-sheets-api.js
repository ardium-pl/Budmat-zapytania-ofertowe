const { google } = require('googleapis');
const dotenv = require("dotenv");
const logger = require("../utils/logger.js")
dotenv.config();


const GOOGLE_SHEETS_ACCOUNT = JSON.parse(process.env.GOOGLE_SHEETS_ACCOUNT);
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TEMPLATE_SHEET_ID = process.env.TEMPLATE_SHEET_ID;

async function insertDataToGoogleSheets(rawData) {
    const auth = new google.auth.GoogleAuth({
        credentials: GOOGLE_SHEETS_ACCOUNT,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheetName = rawData.supplier
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    
    // Request to duplicate the template sheet
    const request = {
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

    try {
        const response = await sheets.spreadsheets.batchUpdate(request);
        logger.info('Duplicated Sheet ID:', sheetName);
    } catch (err) {
        logger.error('Error duplicating sheet:', err);
    }
}

module.exports = {
    insertDataToGoogleSheets, 
};