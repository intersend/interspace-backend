/**
 * Security utilities for data sanitization and protection
 */

// Patterns for sensitive data that should be redacted in logs
const SENSITIVE_PATTERNS = [
  // JWT tokens
  /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
  
  // API keys and secrets
  /api[_-]?key["\s:=]+["']?[A-Za-z0-9\-_]{20,}/gi,
  /secret["\s:=]+["']?[A-Za-z0-9\-_]{20,}/gi,
  /password["\s:=]+["']?[^\s"']+/gi,
  
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Credit card numbers
  /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g,
  
  // Social Security Numbers
  /\b\d{3}-\d{2}-\d{4}\b/g,
  
  // Private keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  
  // Ethereum private keys
  /0x[a-fA-F0-9]{64}/g,
  
  // Base64 encoded sensitive data (common for tokens/keys)
  /[A-Za-z0-9+/]{40,}={0,2}/g
];

// Fields that should be completely removed from logs
const SENSITIVE_FIELDS = [
  'password',
  'hashedPassword',
  'accessToken',
  'refreshToken',
  'idToken',
  'authToken',
  'apiKey',
  'secret',
  'privateKey',
  'serverShare',
  'clientShare',
  'encKey',
  'clientEncKey',
  'rsaPubkeyPem',
  'signature',
  'signedData',
  'otp',
  'verificationCode',
  'twoFactorCode'
];

/**
 * Sanitize a string by redacting sensitive patterns
 */
export function sanitizeString(str: string): string {
  let sanitized = str;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Deep sanitize an object by removing sensitive fields and redacting patterns
 */
export function sanitizeObject(obj: any, depth = 0): any {
  // Prevent infinite recursion
  if (depth > 10) return '[MAX_DEPTH_EXCEEDED]';
  
  if (obj === null || obj === undefined) return obj;
  
  // Handle primitive types
  if (typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  // Handle objects
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Check if this field should be completely removed
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
      continue;
    }
    
    // Check if the key itself contains sensitive patterns
    const sanitizedKey = sanitizeString(key);
    
    // Recursively sanitize the value
    sanitized[sanitizedKey] = sanitizeObject(value, depth + 1);
  }
  
  return sanitized;
}

/**
 * Sanitize error objects before logging
 */
export function sanitizeError(error: any): any {
  if (!error) return error;
  
  const sanitized: any = {
    message: sanitizeString(error.message || ''),
    name: error.name,
    code: error.code
  };
  
  if (error.stack && process.env.NODE_ENV === 'development') {
    sanitized.stack = sanitizeString(error.stack);
  }
  
  // Sanitize any additional properties
  for (const [key, value] of Object.entries(error)) {
    if (!['message', 'name', 'code', 'stack'].includes(key)) {
      sanitized[key] = sanitizeObject(value);
    }
  }
  
  return sanitized;
}

/**
 * Create a safe log message
 */
export function safeLog(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
  const sanitizedMessage = sanitizeString(message);
  const sanitizedData = data ? sanitizeObject(data) : undefined;
  
  const logData = {
    timestamp: new Date().toISOString(),
    level,
    message: sanitizedMessage,
    ...(sanitizedData && { data: sanitizedData })
  };
  
  console[level](JSON.stringify(logData));
}

/**
 * Mask sensitive parts of strings (useful for displaying partial data)
 */
export function maskString(str: string, showChars = 4): string {
  if (!str || str.length <= showChars * 2) {
    return '[MASKED]';
  }
  
  const start = str.substring(0, showChars);
  const end = str.substring(str.length - showChars);
  const masked = '*'.repeat(Math.max(str.length - showChars * 2, 3));
  
  return `${start}${masked}${end}`;
}

/**
 * Check if a string contains sensitive data
 */
export function containsSensitiveData(str: string): boolean {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(str)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate that an object doesn't contain sensitive data in unexpected fields
 */
export function validateNoSensitiveData(obj: any, allowedFields: string[] = []): boolean {
  if (!obj || typeof obj !== 'object') return true;
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip allowed fields
    if (allowedFields.includes(key)) continue;
    
    // Check if the key is a sensitive field
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      return false;
    }
    
    // Check string values for sensitive patterns
    if (typeof value === 'string' && containsSensitiveData(value)) {
      return false;
    }
    
    // Recursively check nested objects
    if (typeof value === 'object' && !validateNoSensitiveData(value, allowedFields)) {
      return false;
    }
  }
  
  return true;
}