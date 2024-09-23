const fs = require('fs').promises;
const path = require('path');
const imaps = require('imap-simple');
const {processAttachment} = require('../attachments/attachmentProcessor');
const {decodeFilename, isAllowedFileType, getFileExtension} = require('../utils/fileUtils');
const {PROCESSED_DIR} = require('../../config/constants');
const logger = require('../utils/logger');
const {decode} = require("docx4js/docs");
const chardet = require('chardet');
const iconv = require('iconv-lite');
const quotedPrintable = require('quoted-printable');

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
        logger.info(`🔍 Found ${messages.length} new messages`);

        for (const message of messages) {
            await processEmail(connection, message);
        }

        logger.info('👌 Finished processing all messages');
    } catch (error) {
        logger.error('Error processing new emails:', error);
    }
}

async function processEmail(connection, message) {
    const {uid} = message.attributes;
    const emailId = Date.now();
    const emailDir = path.join(PROCESSED_DIR, 'combined', `email_${emailId}`);

    try {
        await fs.mkdir(emailDir, {recursive: true});

        // Process email content
        const emailContent = await getEmailContent(connection, message);
        await saveEmailContent(emailContent, emailDir);

        // Process attachments
        const attachmentResults = await processEmailAttachments(connection, message, emailDir);

        // Create metadata file
        await createMetadataFile(emailDir, emailContent, attachmentResults);

        // Create a flag file to indicate email processing is complete
        await fs.writeFile(path.join(emailDir, 'processing_complete'), '');

        // Mark email as seen
        await markMessageAsSeen(connection.imap, uid);
        logger.info(`Processed and marked message ${uid} as seen`);

    } catch (error) {
        logger.error(`Error processing email ${emailId}:`, error);
    }
}

async function getEmailContent(connection, message) {
    const parts = imaps.getParts(message.attributes.struct);
    const textParts = parts.filter(part => part.type === 'text' && part.subtype === 'plain');

    if (textParts.length > 0) {
        const part = textParts[0];
        const partData = await connection.getPartData(message, part);

        // Tablica możliwych kodowań do sprawdzenia
        const encodings = ['utf-8', 'iso-8859-2', 'windows-1250', 'latin1'];

        // Funkcja do sprawdzenia, czy tekst zawiera polskie znaki
        const containsPolishChars = (text) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text);

        // Próba automatycznego wykrycia kodowania
        const detectedEncoding = chardet.detect(Buffer.from(partData));
        if (detectedEncoding) {
            encodings.unshift(detectedEncoding);
        }

        // Próba dekodowania z różnymi kodowaniami
        for (const encoding of encodings) {
            try {
                let decodedContent = iconv.decode(Buffer.from(partData), encoding);
                decodedContent = fixEncodingErrors(decodedContent);
                if (containsPolishChars(decodedContent)) {
                    logger.info(`Successfully decoded email content using ${encoding}`);
                    return decodedContent;
                }
            } catch (error) {
                logger.warn(`Failed to decode with ${encoding}: ${error.message}`);
            }
        }

        // Jeśli żadne kodowanie nie zadziałało, spróbujmy usunąć nieprawidłowe znaki
        logger.warn('All decoding attempts failed, trying to remove invalid characters');
        return fixEncodingErrors(partData.toString());
    }

    return '';
}

async function saveEmailContent(content, emailDir) {
    const emailFilePath = path.join(emailDir, 'email_content.txt');
    await fs.writeFile(emailFilePath, content, {encoding: 'utf8'});
    logger.info(`Email content saved to ${emailFilePath}`);
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
                    logger.info('Attachment saved:', filename);

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

function fixEncodingErrors(text) {
    const replacements = {
        'Â': '',
        'Ă': 'ą',
        'Ć': 'ć',
        'Ĺ': 'ł',
        'Ĺ': 'ń',
        'Ă': 'ó',
        'Ĺ': 'ś',
        'Ĺş': 'ź',
        'ĹĽ': 'ż',
        'ĂŞ': 'ę',
        'Ăł': 'ó',
        'Âł': 'ł'
    };

    return text.replace(/Â|Ă|Ć|Ĺ|Ă|Ĺş|ĹĽ|ĂŞ|Ăł|Âł/g, match => replacements[match] || match);
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