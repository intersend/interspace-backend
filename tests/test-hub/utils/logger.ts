import winston from 'winston';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'tests/test-hub/logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...metadata }: any) => {
  let colorize: (str: string) => string;
  
  switch (level) {
    case 'error':
      colorize = chalk.red;
      break;
    case 'warn':
      colorize = chalk.yellow;
      break;
    case 'info':
      colorize = chalk.blue;
      break;
    case 'debug':
      colorize = chalk.gray;
      break;
    default:
      colorize = (str: string) => str;
  }

  const formattedMessage = colorize(`[${level.toUpperCase()}] ${message}`);
  
  if (Object.keys(metadata).length > 0) {
    return `${formattedMessage}\n${JSON.stringify(metadata, null, 2)}`;
  }
  
  return formattedMessage;
});

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'test-hub' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        consoleFormat
      ),
      silent: process.env.NODE_ENV === 'test' && !process.env.DEBUG
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'test-hub.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'errors.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});

// Add request logger
export function logRequest(req: any, res: any, next: any): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info(`${req.method} ${req.url}`, {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
}

// Export log levels for convenience
export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
} as const;

// Helper to temporarily change log level
export function withLogLevel<T>(level: string, fn: () => T): T {
  const originalLevel = logger.level;
  logger.level = level;
  
  try {
    return fn();
  } finally {
    logger.level = originalLevel;
  }
}

// Helper to create child logger with additional context
export function createLogger(context: Record<string, any>): winston.Logger {
  return logger.child(context);
}