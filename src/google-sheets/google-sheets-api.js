const { google } = require("googleapis");
const dotenv = require("dotenv");
const fs = require("fs").promises;
const path = require("path");
const { createLogger } = require("../utils/logger");
const logger = createLogger(__filename);
dotenv.config();

const GOOGLE_SHEETS_ACCOUNT = JSON.parse(process.env.GOOGLE_SHEETS_ACCOUNT);
const { SPREADSHEET_ID, TEMPLATE_SHEET_ID } = process.env;

async function createUniqueSheetName(sheets, baseName) {
  let sheetName = baseName;
  let counter = 1;
  const existingSheets = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties.title",
  });

  const existingNames = existingSheets.data.sheets.map(
    (sheet) => sheet.properties.title
  );

  while (existingNames.includes(sheetName)) {
    sheetName = `${baseName} - Copy ${counter}`;
    counter++;
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

    logger.debug(
      `Przetworzone dane: ${JSON.stringify(processedData, null, 2)}`
    );

    if (
      !processedData ||
      !processedData.products ||
      processedData.products.length === 0
    ) {
      throw new Error("Brak danych produktów w przetworzonych danych");
    }

    const auth = new google.auth.GoogleAuth({
      credentials: GOOGLE_SHEETS_ACCOUNT,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const baseSheetName = processedData.supplier?.name || "Nowy arkusz";
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

    await sheets.spreadsheets.batchUpdate(duplicateRequest);

    const values = [
      [
        processedData.supplier.name || "N/A",
        processedData.offerDetails.currency || "N/A",
        processedData.offerDetails.deliveryTerms || "N/A",
        processedData.offerDetails.deliveryDate || "N/A",
        processedData.offerDetails.paymentTerms || "N/A",
      ],
      [],
      [],
      [],
      [],
      [],
    ];

    processedData.products.forEach((product) => {
      values.push([
        product.material || "N/A",
        product.thickness || "N/A",
        product.width || "N/A",
        product.grade || "N/A",
        product.surface || "N/A",
        "N/A", // Powłoka lakiernicza - brak w JSON
        "N/A", // Producent - brak w JSON
        product.price || "N/A",

      ]);
    });

    const resource = { values };

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A2`,
      valueInputOption: "RAW",
      resource,
    });

    logger.debug(`Arkusz "${sheetName}" utworzony i dane wstawione pomyślnie.`);
  } catch (error) {
    logger.error(
      `Błąd podczas tworzenia arkusza i wstawiania danych: ${error.message}`
    );
    logger.debug(`Stos błędu: ${error.stack}`);
  }
}

module.exports = {
  createSheetAndInsertData,
};
