// const fs = require('fs').promises;
// const path = require('path');
// const {PROCESSED_DIR} = require('../../config/constants');
// const logger = require('../utils/logger');
// const z = require('zod');
// const OpenAI = require("openai");
//
// // Initialize OpenAI API
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY,
// });
//
// // Define the target JSON schema using Zod
// const EmailDataSchema = z.object({
//     emailId: z.string(),
//     sender: z.string().optional(),
//     recipient: z.string().optional(),
//     subject: z.string(),
//     body: z.string(),
//     attachments: z.array(
//         z.object({
//             filename: z.string(),
//             contentType: z.string().optional(),
//             data: z.any().optional(),
//         })
//     ).optional(),
//     extractedData: z.object({
//         orderNumber: z.string().optional(),
//         supplierName: z.string().optional(),
//         deliveryDate: z.string().optional(),
//         itemsOrdered: z.array(
//             z.object({
//                 item: z.string(),
//                 quantity: z.number(),
//             })
//         ).optional(),
//     }).optional(),
// });
//
// async function transformEmailData(emailDir) {
//     const emailId = path.basename(emailDir).replace('email_', '');
//     const allJsonPath = path.join(emailDir, `all_${emailId}.json`);
//
//     try {
//         const allJsonContent = await fs.readFile(allJsonPath, 'utf8');
//         const emailData = JSON.parse(allJsonContent);
//
//         // Use GPT-4 to extract relevant data from the email body
//         const extractedData = await extractDataWithGPT4(emailData.body);
//
//         // Construct the final JSON object
//         const finalData = {
//             emailId: emailId,
//             sender: emailData.sender,
//             recipient: emailData.recipient,
//             subject: emailData.subject,
//             body: emailData.body,
//             attachments: emailData.attachments,
//             extractedData: extractedData,
//         };
//
//         // Validate the data against the schema
//         const validatedData = EmailDataSchema.parse(finalData);
//
//         // Save the transformed data
//         const transformedJsonPath = path.join(emailDir, `transformed_${emailId}.json`);
//         await fs.writeFile(transformedJsonPath, JSON.stringify(validatedData, null, 2), 'utf8');
//
//         logger.info(`Transformed data saved to ${transformedJsonPath}`);
//     } catch (err) {
//         logger.error(`Error transforming email ${emailId}:`, err);
//     }
// }
//
//
// async function extractDataWithGPT4(emailBody) {
//     try {
//         const prompt = `
// Extract the following information from the email body:
//
// - Order Number
// - Supplier Name
// - Delivery Date
// - Items Ordered (list of items with quantities)
//
// Provide the information in a JSON format with keys: orderNumber, supplierName, deliveryDate, itemsOrdered.
//
// Email Body:
// ${emailBody}
//         `;
//
//         const response = await openai.chat.completions.create({
//             model: 'gpt-4o-2024-08-06',
//             messages: [
//                 {role: 'system', content: 'You are a helpful assistant that extracts structured data from emails.'},
//                 {role: 'user', content: prompt},
//             ],
//             max_tokens: 7000,
//             temperature: 0,
//         });
//
//         // Extract the assistant's reply
//         const assistantReply = response.choices[0].message.content.trim();
//
//         // Parse the assistant's response as JSON
//         const extractedData = JSON.parse(assistantReply);
//
//         return extractedData;
//     } catch (err) {
//         logger.error('Error extracting data with GPT-4:', err);
//         return {};
//     }
// }
//
// module.exports = {
//     transformEmailData
// };
