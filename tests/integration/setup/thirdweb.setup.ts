import { connectDatabase, disconnectDatabase } from '../../../src/utils/database';

// Thirdweb Integration Test Setup
export const TESTNET_CHAINS = {
  sepolia: 11155111,
  mumbai: 80001,
  arbitrumSepolia: 421614,
  optimismSepolia: 11155420,
  baseSepolia: 84532
};

export const INTEGRATION_TEST_CONFIG = {
  // Use environment-provided credentials for integration tests
  THIRDWEB_CLIENT_ID: process.env.THIRDWEB_CLIENT_ID,
  THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY,
  
  // Default to Sepolia testnet for safety
  DEFAULT_TEST_CHAIN: TESTNET_CHAINS.sepolia,
  
  // Test timeouts for network operations
  WALLET_CREATION_TIMEOUT: 30000, // 30 seconds
  TRANSACTION_TIMEOUT: 60000, // 60 seconds
  
  // Test wallet tracking
  CREATED_WALLETS: new Set<string>(),
};

// Global setup for Thirdweb integration tests
export async function setupThirdwebIntegrationTests() {
  console.log('🔧 Setting up Thirdweb integration tests...');
  
  // Ensure we have required credentials
  if (!INTEGRATION_TEST_CONFIG.THIRDWEB_CLIENT_ID || !INTEGRATION_TEST_CONFIG.THIRDWEB_SECRET_KEY) {
    throw new Error('Thirdweb credentials required for integration tests. Check THIRDWEB_CLIENT_ID and THIRDWEB_SECRET_KEY');
  }
  
  // Connect to test database
  await connectDatabase();
  
  console.log('✅ Thirdweb integration test setup complete');
}

// Global teardown for Thirdweb integration tests
export async function teardownThirdwebIntegrationTests() {
  console.log('🧹 Cleaning up Thirdweb integration tests...');
  
  // Log created wallets for reference
  if (INTEGRATION_TEST_CONFIG.CREATED_WALLETS.size > 0) {
    console.log('📋 Created wallets during tests:');
    INTEGRATION_TEST_CONFIG.CREATED_WALLETS.forEach(address => {
      console.log(`  - ${address}`);
    });
    console.log('💡 These wallets should be visible in your Thirdweb dashboard');
  }
  
  // Disconnect from database
  await disconnectDatabase();
  
  console.log('✅ Thirdweb integration test cleanup complete');
}

// Track wallet creation for reporting
export function trackCreatedWallet(address: string) {
  INTEGRATION_TEST_CONFIG.CREATED_WALLETS.add(address);
  console.log(`📝 Tracking created wallet: ${address}`);
}

// Utility to wait for wallet creation with timeout
export async function waitForWalletCreation<T>(
  operation: () => Promise<T>,
  timeout: number = INTEGRATION_TEST_CONFIG.WALLET_CREATION_TIMEOUT
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Wallet creation timed out after ${timeout}ms`));
    }, timeout);

    operation()
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// Utility to validate wallet address format
export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Generate unique profile ID for tests
export function generateTestProfileId(): string {
  return `test_profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
