const winston = require('winston');
const path = require('path');
const { utcToZonedTime, format } = require('date-fns-tz');

// Konfiguracja formatu logów
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: () => {
            const zonedDate = utcToZonedTime(new Date(), 'Europe/Warsaw'); // Konwersja do strefy czasowej Warsaw
            return format(zonedDate, 'yyyy-MM-dd HH:mm:ss', { timeZone: 'Europe/Warsaw' });
        }
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Tworzenie loggera
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // Zapisywanie wszystkich logów do pliku 'combined.log'
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/combined.log'),
            format: logFormat
        }),
        // Zapisywanie logów o poziomie 'error' i wyższym do pliku 'error.log'
        new winston.transports.File({
            filename: path.join(__dirname, '../../logs/error.log'),
            level: 'error',
            format: logFormat
        }),
        // Wyświetlanie logów w konsoli
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        })
    ]
});

module.exports = logger;
