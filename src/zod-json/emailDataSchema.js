const z = require('zod');

// Define the target JSON schema using Zod
const EmailDataSchema = z.object({
    emailId: z.string().optional(),
    content: z.object({
        subject: z.string(),
        body: z.string(),
    }),
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
    attachments: z.array(
        z.object({
            filename: z.string(),
            originalPath: z.string(),
            processedPath: z.string(),
        })
    ).optional(),
});
async function extractDataWithGPT4(openai, emailBody) {
    try {
        const systemPrompt = `
You are an AI assistant specialized in extracting structured data from emails related to orders and deliveries. Your task is to analyze the email content and extract specific information according to the following JSON schema:

{
    "orderNumber": "string",
    "supplierName": "string",
    "deliveryDate": "string (YYYY-MM-DD format if possible)",
    "itemsOrdered": [
        {
            "item": "string",
            "quantity": "number",
            "unitPrice": "number (optional)",
            "totalPrice": "number (optional)"
        }
    ],
    "totalOrderValue": "number (optional)",
    "currency": "string (optional)",
    "paymentTerms": "string (optional)",
    "shippingAddress": "string (optional)",
    "specialInstructions": "string (optional)"
}

Guidelines:
1. Extract as much information as possible that fits the schema.
2. If a piece of information is not present in the email, omit that field from the JSON output.
3. For dates, try to convert them to YYYY-MM-DD format if possible.
4. For numerical values (quantity, prices), ensure they are numbers, not strings.
5. If multiple items are ordered, list them all in the "itemsOrdered" array.
6. Be precise and avoid adding information that is not explicitly stated in the email.
7. If there's ambiguity, choose the most likely interpretation based on context.

Your response should be a valid JSON object containing only the extracted information, without any additional explanation.`;

        const userPrompt = `Extract the relevant information from the following email body:

${emailBody}`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-2024-08-06',
            messages: [
                {role: 'system', content: systemPrompt},
                {role: 'user', content: userPrompt},
            ],
            max_tokens: 8000,
            temperature: 0,
        });

        // Extract the assistant's reply
        const assistantReply = response.choices[0].message.content.trim();

        // Parse the assistant's response as JSON
        return JSON.parse(assistantReply);
    } catch (err) {
        console.error('Error extracting data with GPT-4:', err);
        return {};
    }
}

module.exports = {
    EmailDataSchema,
    extractDataWithGPT4
};