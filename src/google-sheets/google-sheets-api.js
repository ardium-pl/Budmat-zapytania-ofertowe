const {google} = require("googleapis");
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
const {createLogger} = require("../utils/logger");
const logger = createLogger(__filename);
dotenv.config();

const GOOGLE_SHEETS_ACCOUNT = JSON.parse(process.env.GOOGLE_SHEETS_ACCOUNT);
const {SPREADSHEET_ID, TEMPLATE_SHEET_ID} = process.env;

async function createUniqueSheetName(sheets, baseName) {
    let sheetName = baseName || "New Sheet";
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
        try {
            const existingSheets = await sheets.spreadsheets.get({
                spreadsheetId: SPREADSHEET_ID,
                fields: "sheets.properties.title",
            });

            const existingNames = existingSheets.data.sheets.map(
                (sheet) => sheet.properties.title
            );

            if (!existingNames.includes(sheetName)) {
                isUnique = true;
            } else {
                sheetName = `${baseName || "New Sheet"} - Copy ${counter}`;
                counter++;
            }
        } catch (error) {
            logger.error(`Error fetching existing sheet names: ${error.message}`);
            throw error;
        }
    }

    return sheetName;
}

async function createSheetAndInsertData(emailDir) {
    const emailId = path.basename(emailDir).replace("email_", "");
    const processedDataPath = path.join(
        emailDir,
        `processed_offer_${emailId}.json`
    );

    try {
        const rawData = await fs.readFile(processedDataPath, "utf8");
        const processedData = JSON.parse(rawData);

        logger.debug(`Processing data for email ${emailId}`);

        const auth = new google.auth.GoogleAuth({
            credentials: GOOGLE_SHEETS_ACCOUNT,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const sheets = google.sheets({ version: "v4", auth });

        const baseSheetName = processedData.supplier?.name || "New Offer";
        const sheetName = await createUniqueSheetName(sheets, baseSheetName);

        // Create a new sheet
        const addSheetRequest = {
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: sheetName,
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 26,
                                    frozenRowCount: 2
                                },
                                tabColor: {
                                    red: 0.2,
                                    green: 0.7,
                                    blue: 0.9
                                }
                            }
                        }
                    }
                ]
            }
        };

        const addSheetResponse = await sheets.spreadsheets.batchUpdate(addSheetRequest);
        const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;

        // Prepare data for insertion
        const headerRow = ["Offer Details", "", "", "", "", "", "", ""];
        const subHeaderRow = ["Supplier", "Currency", "Delivery Terms", "Delivery Date", "Payment Terms", "Offer Number", "Offer Date", "Total Quantity"];
        const productHeaders = ["Material", "Thickness (mm)", "Width (mm)", "Grade", "Surface", "Paint Coating", "Manufacturer", "Price"];

        const values = [
            headerRow,
            subHeaderRow,
            [
                processedData.supplier?.name || "N/A",
                processedData.offerDetails?.currency || "N/A",
                processedData.offerDetails?.deliveryTerms || "N/A",
                processedData.offerDetails?.deliveryDate || "N/A",
                processedData.offerDetails?.paymentTerms || "N/A",
                processedData.offerNumber || "N/A",
                processedData.offerDate || "N/A",
                processedData.offerDetails?.totalQuantity || "N/A"
            ],
            [],
            ["Products:"],
            productHeaders
        ];

        if (processedData.products && Array.isArray(processedData.products)) {
            processedData.products.forEach((product) => {
                values.push([
                    product.material || "N/A",
                    product.thickness || "N/A",
                    product.width || "N/A",
                    product.grade || "N/A",
                    product.surface || "N/A",
                    product.paintCoating || "N/A",
                    product.manufacturer || "N/A",
                    product.price || "N/A",
                ]);
            });
        } else {
            logger.warn(`No product data found for email ${emailId}`);
        }

        // Insert data
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`,
            valueInputOption: "USER_ENTERED",
            resource: { values },
        });

        // Apply formatting
        const formatRequests = [
            // Main header formatting
            {
                mergeCells: {
                    range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
                    mergeType: "MERGE_ALL"
                }
            },
            {
                repeatCell: {
                    range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.2, green: 0.6, blue: 0.8 },
                            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 14 },
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "MIDDLE"
                        }
                    },
                    fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
                }
            },
            // Sub-header formatting
            {
                repeatCell: {
                    range: { sheetId: newSheetId, startRowIndex: 1, endRowIndex: 2 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                            textFormat: { bold: true },
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "MIDDLE"
                        }
                    },
                    fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
                }
            },
            // Product header formatting
            {
                repeatCell: {
                    range: { sheetId: newSheetId, startRowIndex: 5, endRowIndex: 6 },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 0.8, green: 0.8, blue: 0.8 },
                            textFormat: { bold: true },
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "MIDDLE"
                        }
                    },
                    fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
                }
            },
            // Alternate row coloring
            {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{ sheetId: newSheetId, startRowIndex: 6 }],
                        booleanRule: {
                            condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: "=MOD(ROW(),2)=0" }] },
                            format: { backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } }
                        }
                    },
                    index: 0
                }
            },
            // Add borders
            {
                updateBorders: {
                    range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: values.length, startColumnIndex: 0, endColumnIndex: 8 },
                    top: { style: "SOLID", width: 2, color: { red: 0.2, green: 0.2, blue: 0.2 } },
                    bottom: { style: "SOLID", width: 2, color: { red: 0.2, green: 0.2, blue: 0.2 } },
                    left: { style: "SOLID", width: 2, color: { red: 0.2, green: 0.2, blue: 0.2 } },
                    right: { style: "SOLID", width: 2, color: { red: 0.2, green: 0.2, blue: 0.2 } },
                    innerHorizontal: { style: "SOLID", color: { red: 0.6, green: 0.6, blue: 0.6 } },
                    innerVertical: { style: "SOLID", color: { red: 0.6, green: 0.6, blue: 0.6 } }
                }
            },
            // Enable text wrapping for all cells
            {
                repeatCell: {
                    range: { sheetId: newSheetId },
                    cell: {
                        userEnteredFormat: {
                            wrapStrategy: "WRAP"
                        }
                    },
                    fields: "userEnteredFormat.wrapStrategy"
                }
            }
        ];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests: formatRequests }
        });

        // Auto-resize columns
        const resizeRequest = {
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [{
                    autoResizeDimensions: {
                        dimensions: {
                            sheetId: newSheetId,
                            dimension: "COLUMNS",
                            startIndex: 0,
                            endIndex: 8
                        }
                    }
                }]
            }
        };

        await sheets.spreadsheets.batchUpdate(resizeRequest);

        logger.info(`Enhanced sheet "${sheetName}" created and data inserted successfully for email ${emailId}.`);
    } catch (error) {
        logger.error(`Error creating sheet and inserting data for email ${emailId}: ${error.message}`);
        logger.debug(`Error stack: ${error.stack}`);
    }
}

module.exports = {
    createSheetAndInsertData,
};
