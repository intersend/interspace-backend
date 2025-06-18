import { sanitizeString, sanitizeObject, sanitizeError } from './security';

// Secure logger utility with automatic sanitization
export const logger = {
  info: (message: string, ...args: any[]) => {
    const sanitizedMessage = sanitizeString(message);
    const sanitizedArgs = args.map(arg => 
      arg instanceof Error ? sanitizeError(arg) : sanitizeObject(arg)
    );
    console.log(`[INFO] ${new Date().toISOString()} - ${sanitizedMessage}`, ...sanitizedArgs);
  },
  
  error: (message: string, ...args: any[]) => {
    const sanitizedMessage = sanitizeString(message);
    const sanitizedArgs = args.map(arg => 
      arg instanceof Error ? sanitizeError(arg) : sanitizeObject(arg)
    );
    console.error(`[ERROR] ${new Date().toISOString()} - ${sanitizedMessage}`, ...sanitizedArgs);
  },
  
  warn: (message: string, ...args: any[]) => {
    const sanitizedMessage = sanitizeString(message);
    const sanitizedArgs = args.map(arg => 
      arg instanceof Error ? sanitizeError(arg) : sanitizeObject(arg)
    );
    console.warn(`[WARN] ${new Date().toISOString()} - ${sanitizedMessage}`, ...sanitizedArgs);
  },
  
  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
      const sanitizedMessage = sanitizeString(message);
      const sanitizedArgs = args.map(arg => 
        arg instanceof Error ? sanitizeError(arg) : sanitizeObject(arg)
      );
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${sanitizedMessage}`, ...sanitizedArgs);
    }
  }
};