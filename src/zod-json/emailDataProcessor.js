const {OpenAI} = require('openai');
const {zodResponseFormat} = require('openai/helpers/zod');
const {EmailDataSchema, OutputSchema} = require('./emailDataSchema');
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
                    content: `Jesteś asystentem specjalizującym się w analizie ofert handlowych i tworzeniu strukturyzowanych podsumowań. Obecna data to 24 września 2024.
        
        Przestrzegaj następujących zasad przy tworzeniu podsumowania:
        1. Używaj tylko informacji explicite podanych w danych wejściowych.
        2. Dla brakujących danych:
           - Używaj null dla brakujących liczb (np. quantity: null gdy nie podano ilości).
           - Używaj undefined dla brakujących stringów.
        3. Nie przenoś danych między polami - każde pole wypełniaj tylko danymi dla niego przeznaczonymi.
        4. Dla zakresów liczbowych (np. długość, grubość):
           - Użyj tablicy dwuelementowej [min, max] jeśli podano zakres np. min. 280 - max 300.
           - Użyj pojedynczej liczby, jeśli podano tylko jedną wartość np. 1240.
        5. Upewnij się, że wszystkie dane numeryczne są zapisane jako liczby, nie stringi.
        6. Dla pól produktów:
           - material: rodzaj materiału (np. "stal zimnowalcowana")
           - thickness: grubość w mm
           - width: szerokość w mm
           - grade: gatunek stali (np. "HC220")
           - metalCoating: rodzaj powłoki metalicznej (jeśli podano)
           - paintCoating: rodzaj powłoki lakierniczej (jeśli podano)
           - manufacturer: producent (jeśli podano)
           - price: cena jednostkowa
           - quantity: ilość (jesli podano, nie mieszaj z innnymi polami)
        7. Dla szczegółów oferty (offerDetails):
           - currency: waluta oferty
           - deliveryTerms: warunki dostawy
           - deliveryDate: termin dostawy
           - paymentTerms: termin płatności
        8. Nie dodawaj żadnych informacji, których nie ma w danych wejściowych - lepiej zostawić pole puste niż zgadywać.`
                },
                {
                    role: "user",
                    content: `Przeanalizuj poniższe dane oferty i utwórz podsumowanie:
        
        Temat e-maila: ${validatedData.subject}
        Treść e-maila: ${validatedData.body}
        Załączniki: ${validatedData.metadata.attachments.map(att => att.filename).join(', ')}
        
        Dane z załączników (jeśli dostępne):
        ${JSON.stringify(validatedData.attachments || [], null, 2)}
        
        Utwórz strukturyzowane podsumowanie oferty zgodnie z podanym schematem, uwzględniając wszystkie dostępne informacje.`
                }
            ],
            response_format: zodResponseFormat(OutputSchema, 'offerSummary'),
        });

        // Logowanie zużytych tokenów
        const tokenUsage = completion.usage;
        logger.warn(`Zużyto ${tokenUsage.total_tokens} tokenów. (Prompty: ${tokenUsage.prompt_tokens}, Odpowiedź: ${tokenUsage.completion_tokens})`);


        // const completion = await client.beta.chat.completions.parse({
        //     model: "gpt-4o-2024-08-06",
        //     messages: [
        //         {
        //             role: "system",
        //   content: `Jesteś asystentem, który analizuje dane ofert i tworzy strukturyzowane podsumowania. Obecna data to 24 września 2024.
        //
        //   Przestrzegaj następujących zasad:
        //   1. Jeśli informacja nie jest explicite podana w danych wejściowych, pozostaw pole puste (null dla liczb, undefined dla stringów, szczegolnie dla quantity jak nie ma podanego to napisz null).
        //   2. Nie używaj danych z jednego pola do wypełnienia innego.
        //   3. Dla zakresów (np. długość od-do, albo dla min-max), użyj tablicy dwuelementowej [min, max], w przypadku jej braku zostaw jedna dana.
        //   4. Upewnij się, że dane numeryczne są faktycznie liczbami, a nie stringami.
        //   5. Nie dodawaj żadnych informacji, których nie ma w danych wejściowych.`
        //         },
        //         {
        //             role: "user",
        //             content: `Przeanalizuj poniższe dane oferty i utwórz podsumowanie:
        //
        //   Temat e-maila: ${validatedData.subject}
        //   Treść e-maila: ${validatedData.body}
        //   Załączniki: ${validatedData.metadata.attachments.map(att => att.filename).join(', ')}
        //
        //   Dane z załączników (jeśli dostępne):
        //   ${JSON.stringify(validatedData.attachments || [], null, 2)}
        //
        //   Utwórz strukturyzowane podsumowanie oferty zgodnie z podanym schematem.`
        //         }
        //     ],
        //     response_format: zodResponseFormat(OutputSchema, 'offerSummary'),
        // });

        const message = completion.choices[0]?.message;
        if (message?.parsed) {
            // Dodatkowe czyszczenie i walidacja danych
            const cleanedData = cleanAndValidateData(message.parsed);

            // Zapisz przetworzone dane
            const processedDataPath = path.join(emailDir, `processed_offer_${emailId}.json`);
            await fs.writeFile(processedDataPath, JSON.stringify(cleanedData, null, 2));

            console.log(`Processed offer data saved to ${processedDataPath}`);
            return cleanedData;
        } else {
            console.log(message.refusal);
            throw new Error("Unexpected response from OpenAI API");
        }
    } catch (error) {
        console.error(`Error processing offer data: ${error.message}`);
        throw error;
    }
}

function cleanAndValidateData(data) {
    // Funkcja do czyszczenia pojedynczej wartości
    const cleanValue = (value) => {
        if (typeof value === 'string') {
            return value.trim() === '' ? undefined : value.trim();
        }
        if (typeof value === 'number') {
            return isNaN(value) ? null : value;
        }
        return value;
    };

    // Rekurencyjne czyszczenie obiektu
    const cleanObject = (obj) => {
        if (Array.isArray(obj)) {
            return obj.map(cleanValue);
        }
        if (typeof obj === 'object' && obj !== null) {
            const cleaned = {};
            for (const [key, value] of Object.entries(obj)) {
                cleaned[key] = cleanObject(value);
            }
            return cleaned;
        }
        return cleanValue(obj);
    };

    // Czyszczenie całego obiektu danych
    const cleanedData = cleanObject(data);

    // Dodatkowe sprawdzenia specyficzne dla naszej struktury danych
    if (cleanedData.products) {
        cleanedData.products = cleanedData.products.map(product => {
            if (product.length && !Array.isArray(product.length)) {
                product.length = [product.length, product.length];
            }
            return product;
        });
    }

    return cleanedData;
}

module.exports = {
    processOfferData
};