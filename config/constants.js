const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const ATTACHMENT_DIR = path.join(DATA_DIR, 'attachments');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');
const EMAIL_ADDRESS = process.env.EMAIL_ADDRESS || 'ardiumvpn@gmail.com';
const ALLOWED_EXTENSIONS = [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.csv',
    '.png',
    '.jpg',
    '.jpeg'];
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg'];

module.exports = {
    DATA_DIR,
    ATTACHMENT_DIR,
    PROCESSED_DIR,
    EMAIL_ADDRESS,
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_TYPES
};