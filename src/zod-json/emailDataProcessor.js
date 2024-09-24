const { OpenAI } = require('openai');
const { zodResponseFormat } = require('openai/helpers/zod');
const { EmailDataSchema, OutputSchema } = require('./emailDataSchema');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

async function processOfferData(emailDir) {
    const emailId = path.basename(emailDir).replace('email_', '');
    const allJsonPath = path.join(emailDir, `all_${emailId}.json`);

    try {
        logger.debug(`Processing offer data for email ${emailId}`);
        const rawData = await fs.readFile(allJsonPath, 'utf8');
        const jsonData = JSON.parse(rawData);

        // Waliduj dane wejściowe używając schematu Zod
        const validatedData = EmailDataSchema.parse(jsonData);

        const client = new OpenAI();

        const completion = await client.beta.chat.completions.parse({
            model: "gpt-4o-2024-08-06",
            messages: [
                {
                    role: "system",
                    content: "Jesteś asystentem, który analizuje dane ofert i tworzy strukturyzowane podsumowania. Obecna data to 24 września 2024."
                },
                {
                    role: "user",
                    content: `Przeanalizuj poniższe dane oferty i utwórz podsumowanie:
          
          Temat e-maila: ${validatedData.subject}
          Treść e-maila: ${validatedData.body}
          Załączniki: ${validatedData.metadata.attachments.map(att => att.filename).join(', ')}
          
          Dane z załączników (jeśli dostępne):
          ${JSON.stringify(validatedData.attachments || [], null, 2)}
          
          Utwórz strukturyzowane podsumowanie oferty zgodnie z podanym schematem.`
                }
            ],
            response_format: zodResponseFormat(OutputSchema, 'offerSummary'),
        });

        const message = completion.choices[0]?.message;
        if (message?.parsed) {
            // Zapisz przetworzone dane
            const processedDataPath = path.join(emailDir, `processed_offer_${emailId}.json`);
            await fs.writeFile(processedDataPath, JSON.stringify(message.parsed, null, 2));

            logger.debug(`Processed offer data saved to ${processedDataPath}`);
            return message.parsed;
        } else {
            logger.debug(message.refusal);
            throw new Error("Unexpected response from OpenAI API");
        }
    } catch (error) {
        logger.error(`Error processing offer data: ${error.message}`);
        throw error;
    }
}

module.exports = {
    processOfferData
};