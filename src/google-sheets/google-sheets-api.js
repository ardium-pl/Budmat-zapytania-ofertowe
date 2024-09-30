const {google} = require("googleapis");
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
const {createLogger} = require("../utils/logger");
const logger = createLogger(__filename);
dotenv.config();

const GOOGLE_SHEETS_ACCOUNT = JSON.parse(process.env.GOOGLE_SHEETS_ACCOUNT);
const {SPREADSHEET_ID, TEMPLATE_SHEET_ID} = process.env;

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

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
                // Generate a new name using different patterns based on counter value
                if (counter <= 5) {
                    sheetName = `${baseName || "New Sheet"} - Copy ${counter}`;
                } else if (counter <= 10) {
                    sheetName = `${baseName || "New Sheet"} (${Date.now()})`;
                } else {
                    sheetName = `${baseName || "New Sheet"} - Version ${counter}`;
                }
                counter++;
            }
        } catch (error) {
            logger.error(`Error fetching existing sheet names: ${error.message}`);
            return null;
        }
    }

    return sheetName;
}

async function retryOperation(operation, retries = MAX_RETRIES, delay = INITIAL_RETRY_DELAY) {
    try {
        return await operation();
    } catch (error) {
        if (retries > 0 && (error.code === 502 || error.message.includes("502"))) {
            logger.warn(`Encountered error 502. Retrying in ${delay}ms. Retries left: ${retries}`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryOperation(operation, retries - 1, delay * 2);
        }
        return {error};  // Zwracamy obiekt z błędem zamiast rzucać wyjątek
    }
}

function generateNewSheetName(baseName, counter) {
    // Generowanie nowej unikalnej nazwy arkusza z wykorzystaniem losowego ciągu znaków
    const randomString = Math.random().toString(36).substring(2, 7); // Generuje losowy ciąg znaków
    return `${baseName || "New Sheet"} - ${counter}-${randomString}`;
}

async function createSheetAndInsertData(emailDir) {
    const emailId = path.basename(emailDir).replace("email_", "");
    const processedDataPath = path.join(emailDir, `processed_offer_${emailId}.json`);
    const spamFlagPath = path.join(emailDir, 'spam');

    try {
        // Check if the email was marked as spam
        if (await fs.access(spamFlagPath).then(() => true).catch(() => false)) {
            logger.info(`Skipping sheet creation for spam email ${emailId}`);
            return;
        }

        const rawData = await fs.readFile(processedDataPath, "utf8");
        const processedData = JSON.parse(rawData);

        logger.debug(`Processing data for email ${emailId}`);

        const auth = new google.auth.GoogleAuth({
            credentials: GOOGLE_SHEETS_ACCOUNT,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const sheets = google.sheets({version: "v4", auth});

        const baseSheetName = processedData.supplier?.name || "New Offer";
        let sheetNameResult = await retryOperation(() => createUniqueSheetName(sheets, baseSheetName));

        if (sheetNameResult.error) {
            logger.error(`Failed to create unique sheet name for email ${emailId}: ${sheetNameResult.error.message}`);

            // If error .then
            let newSheetName;
            let attemptCounter = 1;

            while (attemptCounter <= MAX_RETRIES) {
                newSheetName = generateNewSheetName(baseSheetName, attemptCounter);
                logger.warn(`Retrying with a new sheet name: ${newSheetName} (Attempt: ${attemptCounter})`);

                // Ponowna próba stworzenia nowego arkusza z nową nazwą
                sheetNameResult = await retryOperation(() => createUniqueSheetName(sheets, newSheetName));

                if (!sheetNameResult.error) {
                  break;
                }
                attemptCounter++;
            }

            if (sheetNameResult.error) {
                logger.error(`Failed to generate a unique sheet name after ${MAX_RETRIES} attempts for email ${emailId}: ${sheetNameResult.error.message}`);
                return;
            }

        }

        const sheetName = sheetNameResult;


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

        const addSheetResponse = await retryOperation(() => sheets.spreadsheets.batchUpdate(addSheetRequest));

        if (addSheetResponse.error) {
            logger.error(`Failed to add sheet for email ${emailId}: ${addSheetResponse.error.message}`);
            return;
        }
        const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;

    // Prepare data for insertion
    const subHeaderRow = ["Dostawca", "Waluta", "Warunki dostawy", "Data dostawy", "Warunki płatności", "Numer oferty", "Data oferty", "Całkowita ilość"];
    const productHeaders = ["Materiał", "Grubość (mm)", "Szerokość (mm)", "Gatunek", "Powierzchnia", "Powłoka malarska", "Producent", "Cena"];

    const values = [
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
        const updateResult = await retryOperation(() => sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A1`,
            valueInputOption: "USER_ENTERED",
            resource: {values},
        }));

        if (updateResult.error) {
            logger.error(`Failed to update sheet values for email ${emailId}: ${updateResult.error.message}`);
            return;
        }

        // Apply formatting
        // const formatRequests = [
        //     // Sub-header formatting
        //     {
        //         repeatCell: {
        //             range: {sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1},
        //             cell: {
        //                 userEnteredFormat: {
        //                     backgroundColor: {red: 0.8, green: 0.9, blue: 1}, // Light blue
        //                     textFormat: {bold: true},
        //                     horizontalAlignment: "CENTER",
        //                     verticalAlignment: "MIDDLE"
        //                 }
        //             },
        //             fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        //         }
        //     },
        //     // Product header formatting
        //     {
        //         repeatCell: {
        //             range: {sheetId: newSheetId, startRowIndex: 3, endRowIndex: 4},
        //             cell: {
        //                 userEnteredFormat: {
        //                     backgroundColor: {red: 0.8, green: 0.9, blue: 1}, // Light blue
        //                     textFormat: {bold: true},
        //                     horizontalAlignment: "CENTER",
        //                     verticalAlignment: "MIDDLE"
        //                 }
        //             },
        //             fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
        //         }
        //     },
        //     // Alternate row coloring (only for the product data)
        //     {
        //         addConditionalFormatRule: {
        //             rule: {
        //                 ranges: [{sheetId: newSheetId, startRowIndex: 4}],
        //                 booleanRule: {
        //                     condition: {type: "CUSTOM_FORMULA", values: [{userEnteredValue: "=MOD(ROW(),2)=0"}]},
        //                     format: {backgroundColor: {red: 0.9, green: 0.95, blue: 1}} // Very light blue
        //                 }
        //             },
        //             index: 0
        //         }
        //     },
        //     // Add borders
        //     {
        //         updateBorders: {
        //             range: {
        //                 sheetId: newSheetId,
        //                 startRowIndex: 0,
        //                 endRowIndex: values.length,
        //                 startColumnIndex: 0,
        //                 endColumnIndex: 8
        //             },
        //             top: {style: "SOLID", width: 2, color: {red: 0.2, green: 0.2, blue: 0.2}},
        //             bottom: {style: "SOLID", width: 2, color: {red: 0.2, green: 0.2, blue: 0.2}},
        //             left: {style: "SOLID", width: 2, color: {red: 0.2, green: 0.2, blue: 0.2}},
        //             right: {style: "SOLID", width: 2, color: {red: 0.2, green: 0.2, blue: 0.2}},
        //             innerHorizontal: {style: "SOLID", color: {red: 0.6, green: 0.6, blue: 0.6}},
        //             innerVertical: {style: "SOLID", color: {red: 0.6, green: 0.6, blue: 0.6}}
        //         }
        //     },
        //     // Enable text wrapping for all cells
        //     {
        //         repeatCell: {
        //             range: {sheetId: newSheetId},
        //             cell: {
        //                 userEnteredFormat: {
        //                     wrapStrategy: "WRAP"
        //                 }
        //             },
        //             fields: "userEnteredFormat.wrapStrategy"
        //         }
        //     }
        // ];

        const formatRequests = [
            // Sub-header formatting
            {
                repeatCell: {
                    range: {sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1, endColumnIndex: 8},
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: {red: 0.6235, green: 0.7725, blue: 0.9098}, // Light blue
                            textFormat: {bold: true},
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
                    range: {sheetId: newSheetId, startRowIndex: 3, endRowIndex: 4, endColumnIndex: 8},
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: {red: 0.6235, green: 0.7725, blue: 0.9098}, // Light blue
                            textFormat: {bold: true},
                            horizontalAlignment: "CENTER",
                            verticalAlignment: "MIDDLE"
                        }
                    },
                    fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"
                }
            },
            // Alternate row coloring (only for the product data table)
            {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{
                            sheetId: newSheetId,
                            startRowIndex: 4,
                            startColumnIndex: 0,
                            endRowIndex: values.length,
                            endColumnIndex: 8
                        }],
                        booleanRule: {
                            condition: {type: "CUSTOM_FORMULA", values: [{userEnteredValue: "=MOD(ROW(),2)=0"}]},
                            format: {backgroundColor: {red: 0.9, green: 0.95, blue: 1}} // Very light blue
                        }
                    },
                    index: 0
                }
            },
            // Add borders
            {
                updateBorders: {
                    range: {
                        sheetId: newSheetId,
                        startRowIndex: 0,
                        endRowIndex: values.length,
                        startColumnIndex: 0,
                        endColumnIndex: 8
                    },
                    top: {style: "SOLID", width: 2, color: {red: 0.2, green: 0.2, blue: 0.2}},
                    bottom: {style: "SOLID", width: 2, color: {red: 0.2, green: 0.2, blue: 0.2}},
                    left: {style: "SOLID", width: 2, color: {red: 0.2, green: 0.2, blue: 0.2}},
                    right: {style: "SOLID", width: 2, color: {red: 0.2, green: 0.2, blue: 0.2}},
                    innerHorizontal: {style: "SOLID", color: {red: 0.6, green: 0.6, blue: 0.6}},
                    innerVertical: {style: "SOLID", color: {red: 0.6, green: 0.6, blue: 0.6}}
                }
            },
            // Enable text wrapping for all cells
            {
                repeatCell: {
                    range: {sheetId: newSheetId},
                    cell: {
                        userEnteredFormat: {
                            wrapStrategy: "WRAP"
                        }
                    },
                    fields: "userEnteredFormat.wrapStrategy"
                }
            }
        ];

        const format = await retryOperation(() => sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {requests: formatRequests}
        }));

        if (format.error) {
            logger.error(`Failed to format sheet values for email ${emailId}: ${format.error.message}`);
            return;
        }

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

        const resize = await retryOperation(() => sheets.spreadsheets.batchUpdate(resizeRequest));

        if (resize.error) {
            logger.error(`Failed to resize sheet values for email ${emailId}: ${resize.error.message}`);
            return;
        }
        logger.info(`Enhanced sheet "${sheetName}" created and data inserted successfully for email ${emailId}.`);
    } catch (error) {
        logger.error(
            `Error processing data for email ${emailId}: ${error.message}`
        );
        logger.debug(`Error stack: ${error.stack}`);
    }
}

module.exports = {
    createSheetAndInsertData,
};
