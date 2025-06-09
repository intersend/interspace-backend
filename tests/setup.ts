import { connectDatabase, disconnectDatabase, prisma } from '@/utils/database';
import { config } from '../src/utils/config';

// Global test setup
beforeAll(async () => {
  // Ensure we're in test environment
  process.env.NODE_ENV = 'test';

  // Override config for testing

  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/interspace_test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ENCRYPTION_SECRET = 'test-encryption-secret';
  process.env.SILENCE_ADMIN_TOKEN = 'test-silence-token';
  process.env.SILENCE_NODE_URL = 'http://localhost:8080';
  process.env.ORBY_INSTANCE_PRIVATE_API_KEY = 'test-private';
  process.env.ORBY_INSTANCE_PUBLIC_API_KEY = 'test-public';
  process.env.ORBY_APP_NAME = 'test-app';
  process.env.ORBY_PRIVATE_INSTANCE_URL = 'http://localhost:8545';
  // Silence Labs MPC
  process.env.SILENCE_ADMIN_TOKEN = 'test-admin-token';
  process.env.SILENCE_NODE_URL = 'http://localhost:8080';

  // Orby chain abstraction
  process.env.ORBY_INSTANCE_PRIVATE_API_KEY = 'test-orby-private';
  process.env.ORBY_INSTANCE_PUBLIC_API_KEY = 'test-orby-public';
  process.env.ORBY_APP_NAME = 'test-app';
  process.env.ORBY_PRIVATE_INSTANCE_URL = 'http://localhost:8545';

  // Encryption secret required by config
  process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef';
  
  // Connect to test database
  await connectDatabase();
  
  // Reset database for clean slate
  await resetTestDatabase();
});

// Clean up after each test
afterEach(async () => {
  await cleanupTestData();
});

// Global teardown
afterAll(async () => {
  await disconnectDatabase();
});

// Test database utilities
export async function resetTestDatabase() {
  const tablenames = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '_prisma_migrations'
  `;

  for (const { table_name } of tablenames) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "${table_name}" RESTART IDENTITY CASCADE`
    );
  }
}

export async function cleanupTestData() {
  // Clean up in dependency order
  await prisma.tokenAllowance.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.socialProfile.deleteMany();
  await prisma.bookmarkedApp.deleteMany();
  await prisma.folder.deleteMany();
  await prisma.linkedAccount.deleteMany();
  await prisma.smartProfile.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.deviceRegistration.deleteMany();
  await prisma.user.deleteMany();
}

// Test helpers
export const testConfig = {
  port: 3001, // Different port for tests
  baseUrl: 'http://localhost:3001',
  timeout: 30000,
};

// Mock external services for controlled testing
export const mockThirdwebResponses = {
  validSignature: {
    isValid: true,
    address: '0x1234567890123456789012345678901234567890',
  },
  invalidSignature: {
    isValid: false,
    error: 'Invalid signature',
  },
};

// Test data constants
export const testConstants = {
  validAddress: '0x1234567890123456789012345678901234567890',
  validSignature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
  validMessage: 'Sign in to Interspace',
  chainId: 1,
  tokenAddress: '0xA0b86a33E6441a60142aEB9c1E89e8A5b3e8D8D4', // USDC
};

// Extend Jest matchers for better assertions
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidAddress(): R;
      toBeValidJWT(): R;
    }
  }
}

expect.extend({
  toBeValidUUID(received: string) {
    // CUID format: starts with letter, followed by alphanumeric
    const cuidRegex = /^c[a-z0-9]{24,}$/;
    const pass = cuidRegex.test(received);
    
    return {
      message: () => `expected ${received} to be a valid CUID`,
      pass,
    };
  },
  
  toBeValidAddress(received: string) {
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    const pass = addressRegex.test(received);
    
    return {
      message: () => `expected ${received} to be a valid Ethereum address`,
      pass,
    };
  },
  
  toBeValidJWT(received: string) {
    const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    const pass = jwtRegex.test(received);
    
    return {
      message: () => `expected ${received} to be a valid JWT`,
      pass,
    };
  },
});
