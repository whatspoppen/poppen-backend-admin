import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Create logs directory if it doesn't exist
const logDir = './logs';
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Create transports array
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (stack) {
          log += `\n${stack}`;
        }
        return log;
      })
    )
  })
];

// Add file transport if log file path is specified
if (process.env.LOG_FILE_PATH) {
  const logFilePath = process.env.LOG_FILE_PATH;
  const logFileDir = dirname(logFilePath);
  
  // Create directory if it doesn't exist
  if (!existsSync(logFileDir)) {
    mkdirSync(logFileDir, { recursive: true });
  }
  
  transports.push(
    new winston.transports.File({
      filename: logFilePath,
      level: 'info',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

// Add error log file
transports.push(
  new winston.transports.File({
    filename: `${logDir}/error.log`,
    level: 'error',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
);

// Add combined log file
transports.push(
  new winston.transports.File({
    filename: `${logDir}/combined.log`,
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true
});

// Create specialized loggers for different components
export const dbLogger = logger.child({ component: 'database' });
export const authLogger = logger.child({ component: 'auth' });
export const apiLogger = logger.child({ component: 'api' });
export const mcpLogger = logger.child({ component: 'mcp' });

// Helper functions for structured logging
export const logRequest = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    apiLogger.info('HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  });
  
  next();
};

export const logError = (error, context = {}) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    ...context
  });
};

export const logDebug = (message, data = {}) => {
  if (process.env.DEBUG_MODE === 'true') {
    logger.debug(message, data);
  }
};

export const logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Performance Log', {
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
};

// Stream for Morgan HTTP logging
export const httpLogStream = {
  write: (message) => {
    apiLogger.info(message.trim());
  }
};

export default logger; 