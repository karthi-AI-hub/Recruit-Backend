const { createLogger, format, transports } = require('winston');
const config = require('./env');

const isProduction = config.nodeEnv === 'production';

const logger = createLogger({
    level: isProduction ? 'info' : 'debug',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        isProduction
            ? format.json()
            : format.combine(format.colorize(), format.simple()),
    ),
    defaultMeta: { service: 'recruit-api' },
    transports: [
        new transports.Console(),
        // In production, also write error-level logs to a file
        ...(isProduction
            ? [
                  new transports.File({
                      filename: 'logs/error.log',
                      level: 'error',
                      maxsize: 5 * 1024 * 1024, // 5MB
                      maxFiles: 5,
                  }),
                  new transports.File({
                      filename: 'logs/combined.log',
                      maxsize: 10 * 1024 * 1024, // 10MB
                      maxFiles: 5,
                  }),
              ]
            : []),
    ],
});

// Stream adapter for morgan
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    },
};

module.exports = logger;
