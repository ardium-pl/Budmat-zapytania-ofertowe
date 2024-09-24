const fs = require('fs').promises;
const path = require('path');
const z = require('zod');
const logger = require('../utils/logger');

// Define the Zod schema
const EmailDataSchema = z.object({
    emailId: z.undefined(),
    sender: z.string().optional(),
    recipient: z.string().optional(),
    subject: z.string(),
    body: z.string(),
    metadata: z.object({
        emailId: z.string(),
        content: z.object({
            subject: z.string(),
            body: z.string(),
        }),
        attachments: z.array(
            z.object({
                filename: z.string(),
                processed: z.boolean(),
            })
        ),
    }),
    attachments: z.array(z.any()).optional(),
});

async function waitForFile(filePath, maxAttempts = 10, interval = 1000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            await fs.access(filePath);
            return true; // Plik istnieje
        } catch (error) {
            if (attempt === maxAttempts - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
    return false;
}


async function processEmailData(emailDir) {
    const emailId = path.basename(emailDir).replace('email_', '');
    const allJsonPath = path.join(emailDir, `all_${emailId}.json`);
    const processingCompletePath = path.join(emailDir, 'processing_complete');

    logger.debug(`Attempting to transform data for email ${emailId}`);
    logger.debug(`Looking for processing complete flag at: ${processingCompletePath}`);
    logger.debug(`Looking for all JSON file at: ${allJsonPath}`);

    try {
        // Czekaj na flagę processing_complete
        logger.debug(`Waiting for processing complete flag...`);
        await waitForFile(processingCompletePath);
        logger.debug(`Processing complete flag found.`);

        // Czekaj na plik all_{emailId}.json
        logger.debug(`Waiting for all JSON file...`);
        await waitForFile(allJsonPath);
        logger.debug(`All JSON file found.`);

        const rawData = await fs.readFile(allJsonPath, 'utf8');
        const jsonData = JSON.parse(rawData);

        logger.debug(`Successfully read and parsed JSON data.`);

        // Validate the data against our schema
        const validatedData = EmailDataSchema.parse(jsonData);
        logger.debug(`Data successfully validated against schema.`);

        // Save the processed and validated data
        const processedDataPath = path.join(emailDir, `transformed_${emailId}.json`);
        await fs.writeFile(processedDataPath, JSON.stringify(validatedData, null, 2));

        logger.debug(`Transformed data saved to ${processedDataPath}`);
        return validatedData;
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.error("Validation error:", JSON.stringify(error.errors, null, 2));
        } else {
            logger.error(`Error transforming email data: ${error.message}`);
        }
        throw error;
    }
}

module.exports = {
    processEmailData,
    EmailDataSchema,
};