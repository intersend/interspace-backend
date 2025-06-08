process.env.SILENCE_ADMIN_TOKEN = 'test-admin-token';
process.env.SILENCE_NODE_URL = 'http://localhost:8080';
process.env.ORBY_INSTANCE_PRIVATE_API_KEY = 'test-orby-private';
process.env.ORBY_INSTANCE_PUBLIC_API_KEY = 'test-orby-public';
process.env.ORBY_APP_NAME = 'test-app';
process.env.ORBY_PRIVATE_INSTANCE_URL = 'http://localhost:8545';
process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef';

describe('Config', () => {
  test('should load configuration in test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  test('should have required configuration properties', () => {
    // Just test that config can be imported and has basic structure
    const { config } = require('../../src/utils/config');
    expect(config).toHaveProperty('PORT');
    expect(config).toHaveProperty('JWT_SECRET');
    expect(config).toHaveProperty('JWT_EXPIRES_IN');
    expect(config).toHaveProperty('SILENCE_ADMIN_TOKEN');
    expect(config).toHaveProperty('DEFAULT_CHAIN_ID');
  });

  test('should have numeric values for certain configs', () => {
    const { config } = require('../../src/utils/config');
    expect(typeof config.PORT).toBe('number');
    expect(typeof config.DEFAULT_CHAIN_ID).toBe('number');
    expect(typeof config.RATE_LIMIT_MAX_REQUESTS).toBe('number');
  });

  test('should validate test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
});
