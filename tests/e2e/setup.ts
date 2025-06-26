import dotenv from 'dotenv';
import path from 'path';

// Load E2E environment variables
const envPath = process.env.NODE_ENV === 'ci' 
  ? path.resolve(__dirname, '../../.env.ci')
  : path.resolve(__dirname, '../../.env.e2e');

dotenv.config({ path: envPath });

// Fallback to .env.local if E2E env not found
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
}

// Override with E2E specific values
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL?.replace('interspace', 'interspace_e2e').replace('interspace_e2e_e2e', 'interspace_e2e');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

console.log('Test DATABASE_URL:', process.env.DATABASE_URL);

// E2E specific settings
process.env.DISABLE_MPC = 'true'; // Start with MPC disabled for basic tests
process.env.BYPASS_LOGIN = 'false'; // Test real authentication
process.env.REDIS_ENABLED = 'false'; // Start without Redis for basic tests

// Set test timeouts
jest.setTimeout(300000); // 5 minutes default timeout

// Global test utilities
global.console = {
  ...console,
  // Suppress logs during tests unless DEBUG is set
  log: process.env.DEBUG ? console.log : jest.fn(),
  debug: process.env.DEBUG ? console.debug : jest.fn(),
  info: process.env.DEBUG ? console.info : jest.fn(),
  warn: console.warn,
  error: console.error,
};