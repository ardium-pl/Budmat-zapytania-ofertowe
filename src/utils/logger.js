const winston = require('winston');
const path = require('path');
const colors = require('colors');

const DEFAULT_LOG_LEVEL = 'debug';
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
        fractionalSecondDigits: 3,
        timeZone: timeZone,
        hour12: false
    };
    return new Intl.DateTimeFormat(DATE_FORMAT, options).format(date);
};

const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: () => formatDateInTimeZone(new Date(), TIME_ZONE)
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

const getLogFilePath = (filename) => path.join(__dirname, '..', '..', 'logs', filename);

const fileTransport = (filename, level = 'debug') => new winston.transports.File({
    filename: getLogFilePath(filename),
    level,
    format: logFormat
});

const consoleFormat = winston.format.printf(({ level, message, timestamp, label, filename }) => {
    const colorizedLevel = level === 'info' ? colors.green(level) :
        level === 'warn' ? colors.yellow(level) :
            level === 'error' ? colors.red(level) :
                level === 'debug' ? colors.blue(level) :
                    level === 'http' ? colors.cyan(level) :
                        level === 'verbose' ? colors.magenta(level) :
                            level === 'silly' ? colors.grey(level) :
                                colors.white(level);

    return `${colors.grey(timestamp)} [${colorizedLevel}] [${colors.cyan(label)}] [${colors.blue(filename)}]: ${message}`;
});

const consoleTransport = new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize(),
        consoleFormat
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

function createLogger(filePath) {
    const projectRoot = path.resolve(__dirname, '..', '..');
    const relativePath = path.relative(projectRoot, filePath);
    const folderStructure = path.dirname(relativePath).replace(/\\/g, '/');
    const filename = path.basename(filePath);

    const childLogger = logger.child({
        label: folderStructure,
        filename: filename
    });

    const wrapperLogger = {};
    ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'].forEach(level => {
        wrapperLogger[level] = (message, ...meta) => {
            if (typeof message === 'object') {
                message = JSON.stringify(message, null, 2);
            }
            childLogger[level](message, ...meta);
        };
    });

    return wrapperLogger;
}

module.exports = {createLogger};