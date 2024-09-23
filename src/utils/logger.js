const winston = require('winston');
const path = require('path');

const DEFAULT_LOG_LEVEL = 'info';
const TIME_ZONE = 'Europe/Warsaw';
const DATE_FORMAT = 'en-GB';

const formatDateInTimeZone = (date, timeZone) => {
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: timeZone,
        hour12: false
    };
    return new Intl.DateTimeFormat(DATE_FORMAT, options).format(date);
};

const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: () => formatDateInTimeZone(new Date(), TIME_ZONE)
    }),
    winston.format.errors({stack: true}),
    winston.format.json()
);

const getLogFilePath = (filename) => path.join(__dirname, '..', '..', 'logs', filename);

const fileTransport = (filename, level = 'info') => new winston.transports.File({
    filename: getLogFilePath(filename),
    level,
    format: logFormat
});

const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    )
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
    format: logFormat,
    transports: [
        fileTransport('combined.log'),
        fileTransport('error.log', 'error'),
        consoleTransport
    ]
});

// Error handling for file writing
logger.on('error', (error) => {
    console.error('Error in logger:', error);
});

module.exports = logger;