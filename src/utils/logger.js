const winston = require('winston');
const path = require('path');

// Funkcja do formatowania daty w strefie czasowej Europe/Warsaw
const formatDateInTimeZone = (date, timeZone) => {
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: timeZone,
        hour12: false
    }).format(date);
};

// Konfiguracja formatu logów
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: () => formatDateInTimeZone(new Date(), 'Europe/Warsaw')  // Formatowanie daty
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
                winston.format.simple()  // Można zostawić prosty format w konsoli
            )
        })
    ]
});

module.exports = logger;
