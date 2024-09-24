const fs = require('fs').promises;
const path = require('path');
const imaps = require('imap-simple');
const {processAttachment} = require('../attachments/attachmentProcessor');
const {decodeFilename, isAllowedFileType, getFileExtension} = require('../utils/fileUtils');
const {PROCESSED_DIR} = require('../../config/constants');
const logger = require('../utils/logger');
const {simpleParser} = require('mailparser');
const util = require('util');
const {combineEmailData} = require("../utils/combineEmailData");
const {processOfferData} = require("../zod-json/emailDataProcessor");
const {z} = require("zod");

async function processNewEmails(connection) {
    try {
        await connection.openBox('INBOX');
        logger.info('Opened INBOX');

        const searchCriteria = ['UNSEEN'];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
            struct: true,
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        logger.info(`Found ${messages.length} new messages`);

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            logger.info(`Processing message ${i + 1} of ${messages.length}`);
            try {
                await processEmail(connection, message);
            } catch (error) {
                logger.error(`Error processing message ${i + 1}:`, error);
                // Kontynuuj przetwarzanie następnych wiadomości
            }
        }

        logger.info('Finished processing all messages');
    } catch (error) {
        logger.error('Error in processNewEmails:', error);
    }
}

async function processEmail(connection, message) {
    const {uid} = message.attributes;
    const emailId = Date.now();
    const emailDir = path.join(PROCESSED_DIR, 'combined', `email_${emailId}`);

    logger.info(`Starting to process email ${emailId}`, {uid});

    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            logger.error(`Processing of email ${emailId} timed out`, {uid});
            reject(new Error(`Processing of email ${emailId} timed out`));
        }, 120000); // 120 seconds timeout

        try {
            await fs.mkdir(emailDir, {recursive: true});
            logger.info(`Created directory for email ${emailId}`, {uid});

            logger.info(`Getting email content for email ${emailId}`, {uid});
            const emailContent = await getEmailContent(message);
            logger.info(`Got email content for email ${emailId}`, {uid});

            logger.info(`Saving email content for email ${emailId}`);
            await saveEmailContent(emailContent, emailDir);
            logger.info(`Saved email content for email ${emailId}`);

            // Process attachments
            logger.info(`Processing attachments for email ${emailId}`);
            const attachmentResults = await processEmailAttachments(connection, message, emailDir);
            logger.info(`Processed attachments for email ${emailId}`);

            // Create metadata file
            logger.info(`Creating metadata for email ${emailId}`);
            await createMetadataFile(emailDir, emailContent, attachmentResults);
            logger.info(`Created metadata for email ${emailId}`);

            // Create a flag file to indicate email processing is complete
            await fs.writeFile(path.join(emailDir, 'processing_complete'), '');
            logger.info(`Created processing complete flag for email ${emailId}`);

            // Combine email data into a single JSON file
            logger.info(`Combining email data for email ${emailId}`);
            await combineEmailData(emailDir);
            logger.info(`Combined email data for email ${emailId}`);

            // Transform the combined data
            logger.info(`Transforming email data for email ${emailId}`);
            await processOfferData(emailDir);
            logger.info(`Transformed email data for email ${emailId}`);


            // Mark email as seen
            await markMessageAsSeen(connection.imap, uid);
            logger.info(`Processed and marked message ${uid} as seen`);

            clearTimeout(timeout);
            resolve();
        } catch (error) {
            if (error instanceof z.ZodError) {
                logger.error(`Validation error for email ${emailId}:`, JSON.stringify(error.errors, null, 2));
            } else {
                logger.error(`Error processing email ${emailId}:`, error);
            }
            // throw error;
        }
    });
}

async function getEmailContent(message) {
    const {uid} = message.attributes;
    logger.debug('Fetching message', {uid});

    try {
        // Find the part that contains the full email content
        const all = message.parts.find(part => part.which === '');

        // if (!all) {
        //     throw new Error('No full message body found');
        // }

        const rawEmail = all.body;

        logger.debug('Raw email data retrieved', {uid});

        logger.debug('Starting email parsing', {uid});
        const parsedMail = await simpleParser(rawEmail);

        logger.debug('Email parsing completed', {
            subject: parsedMail.subject,
            bodyLength: parsedMail.text ? parsedMail.text.length : 0,
            uid
        });

        return {
            subject: parsedMail.subject,
            body: parsedMail.text
        };
    } catch (err) {
        logger.error('Error fetching or parsing email', {error: err, uid});
        // throw err;
    }
}


async function saveEmailContent(emailContent, emailDir) {
    const subjectFilePath = path.join(emailDir, 'email_subject.txt');
    const bodyFilePath = path.join(emailDir, 'email_body.txt');

    await fs.writeFile(subjectFilePath, emailContent.subject, {encoding: 'utf8'});
    await fs.writeFile(bodyFilePath, emailContent.body, {encoding: 'utf8'});

    logger.info(`Email subject saved to ${subjectFilePath}`);
    logger.info(`Email body saved to ${bodyFilePath}`);
}

async function processEmailAttachments(connection, message, emailDir) {
    const parts = imaps.getParts(message.attributes.struct);
    const attachmentResults = [];

    for (const part of parts) {
        if (part.disposition && part.disposition.type.toUpperCase() === 'ATTACHMENT') {
            const filename = decodeFilename(part.disposition.params.filename);
            const mimeType = part.type;
            const extension = getFileExtension(filename);

            if (isAllowedFileType(filename, mimeType)) {
                try {
                    const partData = await connection.getPartData(message, part);
                    const filePath = path.join(emailDir, filename);
                    await fs.writeFile(filePath, partData);
                    // logger.info('Attachment saved:', filename);

                    const processedFilePath = await processAttachment(filePath, extension);
                    attachmentResults.push({
                        filename,
                        originalPath: filePath,
                        processedPath: processedFilePath
                    });

                } catch (err) {
                    logger.error('Error processing attachment:', filename, err);
                }
            } else {
                logger.warn(`Skipped disallowed attachment: ${filename}`);
            }
        }
    }

    return attachmentResults;
}

async function createMetadataFile(emailDir, emailContent, attachmentResults) {
    const metadata = {
        emailId: path.basename(emailDir).replace('email_', ''),
        content: emailContent,
        attachments: attachmentResults.map(att => ({
            filename: att.filename,
            processed: true
        }))
    };

    const metadataPath = path.join(emailDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    logger.info(`Metadata saved to ${metadataPath}`);
}

async function markMessageAsSeen(connection, uid) {
    return new Promise((resolve, reject) => {
        connection.addFlags(uid, ['\\Seen'], (err) => {
            if (err) {
                logger.error('Error marking message as seen:', err);
                reject(err);
            } else {
                logger.info(`Marked message ${uid} as seen`);
                resolve();
            }
        });
    });
}

module.exports = {
    processNewEmails,
};