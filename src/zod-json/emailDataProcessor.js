const Replicate = require('replicate');
const {zodToJsonSchema} = require('zod-to-json-schema');
const {EmailDataSchema, OutputSchema} = require('./emailDataSchema');
const fs = require('fs').promises;
const path = require('path');
const {createLogger} = require('../utils/logger');
const logger = createLogger(__filename);
const axios = require('axios');

async function processOfferData(emailDir) {
    const emailId = path.basename(emailDir).replace('email_', '');
    const allJsonPath = path.join(emailDir, `all_${emailId}.json`);
    const apiEndpoint = process.env.API_ENDPOINT;


    try {
        logger.debug(`Processing offer data for email ${emailId}`);
        const rawData = await fs.readFile(allJsonPath, 'utf8');
        const jsonData = JSON.parse(rawData);

        // Validate input data using Zod schema
        const validatedData = EmailDataSchema.parse(jsonData);

        // Check for spam
        if (isSpam(validatedData.subject, validatedData.body)) {
            logger.warn(`Email ${emailId} detected as spam`);
            await fs.writeFile(path.join(emailDir, 'spam'), '');
            return {spam: true};
        }

        // Initialize Replicate client
        const replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN
        });

        // Format the prompts
        const systemPrompt = `Jesteś asystentem specjalizującym się w analizie ofert handlowych i tworzeniu strukturyzowanych podsumowań. Obecna data to 24 września 2024.
        
        Przestrzegaj następujących zasad przy tworzeniu podsumowania:
        1. Używaj tylko informacji explicite podanych w danych wejściowych.
        2. Dla brakujących danych:
           - Używaj null dla brakujących liczb (np. quantity: null gdy nie podano ilości).
           - NIE UŻYWAJ undefined - zawsze używaj null
        3. Nie przenoś danych między polami - każde pole wypełniaj tylko danymi dla niego przeznaczonymi.
        4. Dla zakresów liczbowych (np. długość, grubość):
           - Użyj tablicy dwuelementowej [min, max] jeśli podano zakres np. min. 280 - max 300.
           - Użyj pojedynczej liczby, jeśli podano tylko jedną wartość np. 1240.
        5. Upewnij się, że wszystkie dane numeryczne są zapisane jako liczby, nie stringi.
        6. Jeżeli nie możesz łatwo znaleźć dostawcy, spróbuj znaleźć go z domenie mailowej.
        7. Dla pól produktów:
           - surface: rodzaj powierzchni (np. "gładka", "ryflowana", albo klasyfikowana przez normy np. A, B, C)
           - nameOfProduct: nazwa produktu (np. "Blacha stalowa")
           - material: rodzaj materiału (ta informacja często występuje przy kluczu 'Commodity' np. "stal zimnowalcowana")
           - thickness: grubość w mm
           - width: szerokość w mm
           - grade: gatunek stali (np. "HC220")
           - metalCoating: rodzaj powłoki metalicznej (jeśli podano)
           - paintCoating: rodzaj powłoki lakierniczej (jeśli podano)
           - manufacturer: producent (jeśli podano)
           - price: cena danego produktu (jeśli podano).
           - quantity: ilość (jesli podano, nie mieszaj z innymi polami)
        8. Dla szczegółów oferty (offerDetails):
           - currency: waluta oferty
           - deliveryTerms: warunki dostawy (np. CIP Gdańsk, DDP Płock)
           - deliveryDate: termin dostawy (np. Sept/Oct, )
           - paymentTerms: termin płatności (np. "net cash. 60 days date of invoice")
        9. Nie dodawaj żadnych informacji, których nie ma w danych wejściowych - lepiej zostawić pole puste niż zgadywać.
        
        WAŻNE: Odpowiedz tylko w formacie JSON zgodnym z podanym schematem. Nie dodawaj żadnego tekstu przed ani po JSON.
        
        Schemat JSON dla odpowiedzi:
        ${JSON.stringify(zodToJsonSchema(OutputSchema, {
            topRef: false,
            definitions: false
        }), null, 2)}`;

        const userPrompt = `Przeanalizuj poniższe dane oferty i utwórz podsumowanie:
        
        Temat e-maila: ${validatedData.subject}
        Treść e-maila: ${validatedData.body}
        Załączniki: ${validatedData.metadata.attachments.map(att => att.filename).join(', ')}
        
        Dane z załączników (jeśli dostępne):
        ${JSON.stringify(validatedData.attachments || [], null, 2)}
        
        Utwórz strukturyzowane podsumowanie oferty zgodnie z podanym schematem, uwzględniając wszystkie dostępne informacje.`;

        try {
            logger.info(`Calling Replicate API for email ${emailId}`);
            const output = await replicate.run(
                "meta/meta-llama-3.1-405b-instruct",
                {
                    input: {
                        top_k: 50,
                        top_p: 0.9,
                        prompt: userPrompt,
                        max_tokens: 16384,
                        temperature: 0.3,
                        system_prompt: systemPrompt,
                        presence_penalty: 0,
                        frequency_penalty: 0
                    }
                }
            );

            logger.info('Received response from Replicate');
            logger.debug(`Output type: ${typeof output}`);
            logger.debug(`Is array: ${Array.isArray(output)}`);
            logger.debug(`Raw output from Replicate: ${JSON.stringify(output)}`);

            // Próbujemy znaleźć JSON w odpowiedzi
            let combinedOutput = '';
            if (Array.isArray(output)) {
                logger.debug(`Output is array with length: ${output.length}`);
                if (output.length > 0) {
                    logger.debug(`First elements: ${JSON.stringify(output.slice(0, 3))}`);
                }
                combinedOutput = output.join('');
            } else if (typeof output === 'string') {
                logger.debug(`Output is string with length: ${output.length}`);
                combinedOutput = output;
            } else {
                logger.error(`Unexpected output type: ${typeof output}`);
                logger.error(`Output value: ${JSON.stringify(output)}`);
                return null;
            }

            logger.debug(`Combined output length: ${combinedOutput.length}`);
            if (combinedOutput.length > 0) {
                logger.debug(`Combined output preview: ${combinedOutput.substring(0, 500)}`);
            }

            // Bezpieczniejsze szukanie JSON w tekście
            let jsonData = null;
            const openBraceIndex = combinedOutput.indexOf('{');
            const closeBraceIndex = combinedOutput.lastIndexOf('}');

            logger.debug(`Open brace index: ${openBraceIndex}`);
            logger.debug(`Close brace index: ${closeBraceIndex}`);

            if (openBraceIndex !== -1 && closeBraceIndex !== -1) {
                const possibleJson = combinedOutput.substring(openBraceIndex, closeBraceIndex + 1);
                logger.debug(`Possible JSON preview: ${possibleJson.substring(0, 500)}`);

                try {
                    const cleanedJson = possibleJson
                        .replace(/\n/g, ' ')
                        .replace(/\r/g, ' ')
                        .replace(/\t/g, ' ')
                        .replace(/\\"/g, '"')
                        .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*(?:[^*]|\*(?!\/))*\*\//g, (match, str) => str || '')
                        .replace(/,\s*([\]}])/g, '$1');

                    logger.debug(`Cleaned JSON preview: ${cleanedJson.substring(0, 500)}`);

                    jsonData = JSON.parse(cleanedJson);
                    logger.info('Successfully parsed JSON from response');
                    logger.debug(`Parsed data preview: ${JSON.stringify(jsonData).substring(0, 500)}`);
                } catch (jsonError) {
                    logger.error(`Failed to parse possible JSON: ${jsonError.message}`);
                    logger.error(`JSON parse error location: ${jsonError.message}`);

                    // Spróbujmy znaleźć inny fragment JSON
                    const allJsonMatches = combinedOutput.match(/\{[\s\S]*?\}/g);
                    if (allJsonMatches) {
                        logger.debug(`Found ${allJsonMatches.length} alternative JSON matches`);
                        for (let i = 0; i < allJsonMatches.length; i++) {
                            const match = allJsonMatches[i];
                            logger.debug(`Trying alternative match ${i + 1}/${allJsonMatches.length}`);
                            logger.debug(`Match preview: ${match.substring(0, 200)}`);

                            try {
                                const cleanedMatch = match
                                    .replace(/\n/g, ' ')
                                    .replace(/\r/g, ' ')
                                    .replace(/\t/g, ' ')
                                    .replace(/\\"/g, '"')
                                    .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*(?:[^*]|\*(?!\/))*\*\//g, (match, str) => str || '')
                                    .replace(/,\s*([\]}])/g, '$1');

                                jsonData = JSON.parse(cleanedMatch);
                                logger.info(`Successfully parsed JSON from alternative match ${i + 1}`);
                                logger.debug(`Parsed alternative data: ${JSON.stringify(jsonData).substring(0, 200)}`);
                                break;
                            } catch (e) {
                                logger.error(`Failed to parse alternative JSON ${i + 1}: ${e.message}`);
                                continue;
                            }
                        }
                    } else {
                        logger.error('No alternative JSON matches found');
                    }
                }
            } else {
                logger.error('No JSON structure markers found in output');
                if (combinedOutput) {
                    logger.debug(`Output content preview: ${combinedOutput.substring(0, 200)}`);
                } else {
                    logger.error('Combined output is empty or null');
                }
            }

            const cleanedData = cleanAndValidateData(jsonData);

            // Save processed data
            const processedDataPath = path.join(emailDir, `processed_offer_${emailId}.json`);
            await fs.writeFile(processedDataPath, JSON.stringify(cleanedData, null, 2));

            logger.debug(`Processed offer data saved to ${processedDataPath}`);
            return cleanedData;

        } catch (error) {
            logger.error(`Error in processOfferData: ${error.message}`);
            logger.error(`Stack trace: ${error.stack}`);
            return null;
        }
    } catch (error) {
        logger.error(`Error processing offer data for email ${emailId}: ${error.message}`);
        return null;
    }
}


function isSpam(subject, body) {
    const spamKeywords = ['alert', 'security', 'spam', 'phishing', 'Privacy Checkup', 'privacycheckup'];
    const combinedText = (subject + ' ' + body).toLowerCase();
    return spamKeywords.some(keyword => combinedText.includes(keyword));
}


// Retry processing offer data in case of rate limit errors -> 429 open Ai error
async function processOfferDataWithRetry(emailDir, maxRetries = 5, initialDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await processOfferData(emailDir);
            logger.info(`Successfully processed offer data on attempt ${attempt}`);
            return result;
        } catch (error) {
            if (attempt < maxRetries) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                logger.warn(`Error occurred. Retrying in ${delay}ms. Attempt ${attempt} of ${maxRetries}`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                logger.error(`Error processing offer data on attempt ${attempt}: ${error.message}`);
                break;
            }
        }
    }
    logger.error(`Failed to process offer data after ${maxRetries} attempts.`);
    return null;
}

function cleanAndValidateData(data) {
    const cleanValue = (value) => {
        if (Array.isArray(value)) {
            return value.map(cleanValue);
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed === '' ? undefined : trimmed;
        }
        if (typeof value === 'number') {
            return isNaN(value) ? null : value;
        }
        return value;
    };

    const cleanObject = (obj) => {
        if (Array.isArray(obj)) {
            return obj.map(cleanObject);
        }
        if (obj && typeof obj === 'object') {
            const cleaned = {};
            for (const [key, value] of Object.entries(obj)) {
                cleaned[key] = cleanObject(value);
            }
            return cleaned;
        }
        return cleanValue(obj);
    };

    return cleanObject(data);
}


module.exports = {
    processOfferData
};