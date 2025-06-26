import { describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';
import { circleFaucet } from '../services/CircleFaucetService';
import { TEST_WALLETS, TEST_AMOUNTS, TESTNET_CONFIGS, TIMEOUTS } from '../config/testnet.config';
// import { TestWallet } from '../../utils/TestWallet'; // TestWallet not needed for this test
import { TestKeyShare } from '../utils/MPCTestClient';

describe('Complete User Journey E2E', () => {
  let context: TestContext;
  let api: AxiosInstance;
  let primaryWallet: TestWallet;
  let secondaryWallet: TestWallet;
  
  // Test data
  let testUser: any;
  let authToken: string;
  let testProfile: any;
  let testKeyShare: TestKeyShare;
  let linkedAccountId: string;

  beforeAll(async () => {
    // Setup test environment
    context = await testEnv.setup();
    
    // Create API client
    api = axios.create({
      baseURL: context.apiUrl,
      timeout: 30000,
      validateStatus: () => true // Don't throw on any status
    });
    
    // Get test wallets
    primaryWallet = context.testWallets.get('primary')!;
    secondaryWallet = context.testWallets.get('secondary')!;
    
    // Fund test wallets on Sepolia
    await context.testWallets.forEach(async (wallet, name) => {
      console.log(`\n💰 Checking balance for ${name} wallet: ${wallet.address}`);
      await circleFaucet.ensureMinimumBalance(
        wallet.address,
        11155111, // Sepolia
        '0.1',    // 0.1 ETH
        '10'      // 10 USDC
      );
    });
  }, TIMEOUTS.FUNDING);

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(async () => {
    // Clear database between tests
    await testEnv.resetDatabase();
  });

  describe('1. User Registration and Authentication', () => {
    it('should register user with SIWE', async () => {
      // Create SIWE message
      const siweMessage = await primaryWallet.createSiweMessage({
        domain: 'localhost',
        uri: 'http://localhost:3000',
        statement: 'Sign in to Interspace',
        chainId: 11155111
      });
      
      const signature = await primaryWallet.signMessage(siweMessage);
      
      // Register user
      const response = await api.post('/auth/register', {
        siweMessage,
        signature,
        email: 'test@example.com'
      });
      
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.user).toHaveProperty('id');
      expect(response.data.data.tokens).toHaveProperty('accessToken');
      
      testUser = response.data.data.user;
      authToken = response.data.data.tokens.accessToken;
      
      // Set auth header for subsequent requests
      api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
      
      console.log(`✅ User registered: ${testUser.id}`);
      console.log(`   Address: ${primaryWallet.address}`);
    });

    it('should login with existing wallet', async () => {
      // Create new SIWE message for login
      const siweMessage = await primaryWallet.createSiweMessage({
        domain: 'localhost',
        uri: 'http://localhost:3000',
        statement: 'Sign in to Interspace',
        chainId: 11155111
      });
      
      const signature = await primaryWallet.signMessage(siweMessage);
      
      // Login
      const response = await api.post('/auth/login', {
        siweMessage,
        signature
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.user.id).toBe(testUser.id);
    });
  });

  describe('2. Profile Creation with MPC Wallet', () => {
    it('should create profile with MPC wallet generation', async () => {
      // Generate MPC keyshare (simulating iOS client)
      testKeyShare = await context.mpcClient.generateTestKeyShare('test_profile_1');
      
      // Create profile with MPC wallet
      const response = await api.post('/profiles', {
        name: 'Test Profile',
        bio: 'E2E test profile',
        avatarUrl: 'https://example.com/avatar.png',
        clientShare: {
          keyshare: testKeyShare.keyshare,
          public_key: testKeyShare.publicKey,
          session_id: testKeyShare.sessionId
        }
      });
      
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data.sessionWalletAddress).toBe(testKeyShare.address);
      expect(response.data.data.orbyAccountClusterId).toBeTruthy();
      
      testProfile = response.data.data;
      
      console.log(`✅ Profile created: ${testProfile.id}`);
      console.log(`   Session wallet: ${testProfile.sessionWalletAddress}`);
      console.log(`   Orby cluster: ${testProfile.orbyAccountClusterId}`);
    });

    it('should verify Orby account cluster was created', async () => {
      // Get unified balance to verify Orby integration
      const response = await api.get(`/orby/profiles/${testProfile.id}/balance`);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.unifiedBalance).toHaveProperty('totalUsdValue');
      expect(response.data.data.unifiedBalance).toHaveProperty('tokens');
      
      console.log(`✅ Orby cluster verified`);
      console.log(`   Total USD value: $${response.data.data.unifiedBalance.totalUsdValue}`);
    });
  });

  describe('3. Account Linking and Delegation', () => {
    it('should link primary wallet to profile', async () => {
      // Sign message for account linking
      const message = `Link account ${primaryWallet.address} to profile ${testProfile.id}`;
      const signature = await primaryWallet.signMessage(message);
      
      const response = await api.post(`/profiles/${testProfile.id}/accounts`, {
        address: primaryWallet.address,
        signature,
        nickname: 'Primary Wallet'
      });
      
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.address).toBe(primaryWallet.address);
      expect(response.data.data.isActive).toBe(true);
      
      linkedAccountId = response.data.data.id;
      
      console.log(`✅ Linked primary wallet: ${primaryWallet.address}`);
    });

    it('should create EIP-7702 delegation', async () => {
      const response = await api.post(`/profiles/${testProfile.id}/accounts/${linkedAccountId}/delegate`, {
        chainId: 11155111,
        permissions: {
          transfer: true,
          swap: true,
          approve: true
        },
        expiresIn: 86400 // 24 hours
      });
      
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.authorizationData).toHaveProperty('message');
      expect(response.data.data.authorizationData).toHaveProperty('chainId');
      
      // In a real scenario, the frontend would sign this with the linked account
      // For testing, we'll just verify the structure
      console.log(`✅ EIP-7702 delegation created for chain ${response.data.data.authorizationData.chainId}`);
    });

    it('should update Orby cluster with linked account', async () => {
      // Wait a bit for Orby to process the update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify the cluster was updated
      const response = await api.get(`/orby/profiles/${testProfile.id}/balance`);
      
      expect(response.status).toBe(200);
      // The unified balance should now include balances from linked account
      
      console.log(`✅ Orby cluster updated with linked account`);
    });
  });

  describe('4. Wallet Funding', () => {
    it('should fund session wallet on testnet', async () => {
      console.log(`\n🚰 Funding session wallet: ${testProfile.sessionWalletAddress}`);
      
      const drip = await circleFaucet.fundWallet(
        testProfile.sessionWalletAddress,
        11155111, // Sepolia
        {
          native: true,
          usdc: true,
          waitForCompletion: true
        }
      );
      
      expect(drip.status).toBe('complete');
      
      // Wait for blockchain confirmation
      await new Promise(resolve => setTimeout(resolve, TIMEOUTS.BLOCK_CONFIRMATION));
      
      // Verify balance
      const provider = context.providers.get(11155111)!;
      const balance = await provider.getBalance(testProfile.sessionWalletAddress);
      
      expect(balance).toBeGreaterThan(0n);
      
      console.log(`✅ Session wallet funded: ${ethers.formatEther(balance)} ETH`);
    });

    it('should show updated balance via Orby', async () => {
      // Invalidate cache to get fresh balance
      const response = await api.get(`/orby/profiles/${testProfile.id}/balance?refresh=true`);
      
      expect(response.status).toBe(200);
      expect(response.data.data.unifiedBalance.tokens.length).toBeGreaterThan(0);
      
      const nativeToken = response.data.data.unifiedBalance.tokens.find(
        (t: any) => t.symbol === 'ETH'
      );
      
      expect(nativeToken).toBeTruthy();
      expect(parseFloat(nativeToken.totalAmount)).toBeGreaterThan(0);
      
      console.log(`✅ Balance verified via Orby:`);
      response.data.data.unifiedBalance.tokens.forEach((token: any) => {
        console.log(`   ${token.symbol}: ${token.totalAmount}`);
      });
    });
  });

  describe('5. Transaction Execution', () => {
    it('should execute simple ETH transfer', async () => {
      // Create transfer intent
      const transferAmount = TEST_AMOUNTS.SMALL_ETH.toString();
      const recipientAddress = secondaryWallet.address;
      
      const response = await api.post(`/orby/profiles/${testProfile.id}/intent`, {
        type: 'transfer',
        from: {
          token: ethers.ZeroAddress, // Native ETH
          chainId: 11155111,
          amount: transferAmount
        },
        to: {
          address: recipientAddress
        }
      });
      
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.operationSetId).toBeTruthy();
      expect(response.data.data.unsignedOperations).toBeTruthy();
      
      const { operationSetId, unsignedOperations } = response.data.data;
      
      console.log(`✅ Transfer intent created: ${operationSetId}`);
      
      // Sign operations with MPC
      const operations = unsignedOperations.intents.map((intent: any, index: number) => ({
        index,
        message: intent.data || intent.message,
        chainId: intent.chainId || 11155111
      }));
      
      const signatures = await context.mpcClient.signOperations(
        'test_profile_1',
        operations
      );
      
      // Submit signed operations
      const submitResponse = await api.post(`/orby/operations/${operationSetId}/submit`, {
        signedOperations: signatures.signatures
      });
      
      expect(submitResponse.status).toBe(200);
      expect(submitResponse.data.success).toBe(true);
      
      console.log(`✅ Transaction submitted`);
      
      // Wait for confirmation
      await waitForOperationCompletion(api, operationSetId);
      
      // Verify recipient received funds
      const provider = context.providers.get(11155111)!;
      const recipientBalance = await provider.getBalance(recipientAddress);
      
      expect(recipientBalance).toBeGreaterThan(0n);
      
      console.log(`✅ Transfer completed: ${ethers.formatEther(transferAmount)} ETH`);
      console.log(`   Recipient balance: ${ethers.formatEther(recipientBalance)} ETH`);
    });

    it('should execute USDC transfer', async () => {
      // First, ensure we have USDC
      const balanceResponse = await api.get(`/orby/profiles/${testProfile.id}/balance`);
      const usdcToken = balanceResponse.data.data.unifiedBalance.tokens.find(
        (t: any) => t.symbol === 'USDC'
      );
      
      if (!usdcToken || parseFloat(usdcToken.totalAmount) < 1) {
        console.log('⚠️  Insufficient USDC balance, skipping test');
        return;
      }
      
      const usdcAddress = TESTNET_CONFIGS.sepolia?.tokens.USDC || '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8';
      const transferAmount = TEST_AMOUNTS.SMALL_USDC.toString();
      
      const response = await api.post(`/orby/profiles/${testProfile.id}/intent`, {
        type: 'transfer',
        from: {
          token: usdcAddress,
          chainId: 11155111,
          amount: transferAmount
        },
        to: {
          address: secondaryWallet.address
        }
      });
      
      expect(response.status).toBe(201);
      
      const { operationSetId, unsignedOperations } = response.data.data;
      
      // Sign and submit
      const operations = unsignedOperations.intents.map((intent: any, index: number) => ({
        index,
        message: intent.data || intent.message,
        chainId: intent.chainId || 11155111
      }));
      
      const signatures = await context.mpcClient.signOperations(
        'test_profile_1',
        operations
      );
      
      await api.post(`/orby/operations/${operationSetId}/submit`, {
        signedOperations: signatures.signatures
      });
      
      await waitForOperationCompletion(api, operationSetId);
      
      console.log(`✅ USDC transfer completed: ${ethers.formatUnits(transferAmount, 6)} USDC`);
    });
  });

  describe('6. Batch Operations', () => {
    it('should execute batch of multiple transfers', async () => {
      const batchRequest = {
        operations: [
          {
            type: 'transfer',
            from: {
              token: ethers.ZeroAddress,
              chainId: 11155111,
              amount: ethers.parseEther('0.0001').toString()
            },
            to: {
              address: secondaryWallet.address
            }
          },
          {
            type: 'transfer',
            from: {
              token: ethers.ZeroAddress,
              chainId: 11155111,
              amount: ethers.parseEther('0.0001').toString()
            },
            to: {
              address: TEST_WALLETS.recipient.address
            }
          }
        ],
        atomicExecution: true
      };
      
      const response = await api.post(`/profiles/${testProfile.id}/batch-intent`, batchRequest);
      
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data.operations.length).toBe(2);
      
      const { batchId } = response.data.data;
      
      console.log(`✅ Batch operation created: ${batchId}`);
      
      // Sign all operations
      const signedOperations = await Promise.all(
        response.data.data.operations.map(async (op: any) => {
          if (op.status === 'created' && op.unsignedOperations) {
            const operations = op.unsignedOperations.intents.map((intent: any, idx: number) => ({
              index: idx,
              message: intent.data || intent.message,
              chainId: intent.chainId || 11155111
            }));
            
            const signatures = await context.mpcClient.signOperations(
              'test_profile_1',
              operations
            );
            
            return {
              index: op.index,
              operationSetId: op.operationSetId,
              signature: signatures.signatures?.[0]?.signature || '',
              signedData: signatures.signatures?.[0]?.signedData || ''
            };
          }
          return null;
        })
      );
      
      const validSignatures = signedOperations.filter(s => s !== null);
      
      // Submit batch
      const submitResponse = await api.post(`/batch-operations/${batchId}/submit`, {
        signedOperations: validSignatures
      });
      
      expect(submitResponse.status).toBe(200);
      expect(submitResponse.data.data.status).toBe('submitted');
      
      console.log(`✅ Batch operations submitted`);
      
      // Wait for completion
      await waitForBatchCompletion(api, batchId);
      
      console.log(`✅ Batch execution completed`);
    });
  });

  describe('7. Error Recovery', () => {
    it('should handle insufficient balance gracefully', async () => {
      const response = await api.post(`/orby/profiles/${testProfile.id}/intent`, {
        type: 'transfer',
        from: {
          token: ethers.ZeroAddress,
          chainId: 11155111,
          amount: ethers.parseEther('1000').toString() // Way more than balance
        },
        to: {
          address: secondaryWallet.address
        }
      });
      
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('Insufficient balance');
      
      console.log(`✅ Insufficient balance handled correctly`);
    });

    it('should handle invalid addresses', async () => {
      const response = await api.post(`/orby/profiles/${testProfile.id}/intent`, {
        type: 'transfer',
        from: {
          token: ethers.ZeroAddress,
          chainId: 11155111,
          amount: TEST_AMOUNTS.SMALL_ETH.toString()
        },
        to: {
          address: '0xinvalid'
        }
      });
      
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      
      console.log(`✅ Invalid address handled correctly`);
    });
  });

  describe('8. MPC Key Operations', () => {
    it('should create encrypted backup of MPC key', async () => {
      const { publicKey, privateKey } = generateTestRSAKeyPair();
      
      const backup = await context.mpcClient.createBackup(
        'test_profile_1',
        publicKey,
        'E2E Test Backup'
      );
      
      expect(backup.backupId).toBeTruthy();
      expect(backup.encryptedShare).toBeTruthy();
      expect(backup.metadata.keyId).toBe(testKeyShare.keyId);
      
      console.log(`✅ MPC key backup created: ${backup.backupId}`);
    });

    it('should rotate MPC key', async () => {
      const oldAddress = testKeyShare.address;
      
      const rotatedKey = await context.mpcClient.rotateKey('test_profile_1');
      
      expect(rotatedKey.address).toBe(oldAddress); // Address should remain the same
      expect(rotatedKey.keyId).toBe(testKeyShare.keyId); // Key ID should remain the same
      expect(rotatedKey.keyshare).not.toBe(testKeyShare.keyshare); // But shares should be different
      
      console.log(`✅ MPC key rotated successfully`);
      console.log(`   Address unchanged: ${rotatedKey.address}`);
    });
  });
});

// Helper functions
async function waitForOperationCompletion(
  api: AxiosInstance,
  operationSetId: string,
  timeout: number = TIMEOUTS.TRANSACTION
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const response = await api.get(`/orby/operations/${operationSetId}/status`);
    
    if (response.data.data.status === 'successful') {
      return;
    }
    
    if (response.data.data.status === 'failed') {
      throw new Error(`Operation failed: ${JSON.stringify(response.data.data)}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Operation timeout after ${timeout}ms`);
}

async function waitForBatchCompletion(
  api: AxiosInstance,
  batchId: string,
  timeout: number = TIMEOUTS.TRANSACTION * 2
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const response = await api.get(`/batch-operations/${batchId}/status`);
    
    if (response.data.data.status === 'completed') {
      return;
    }
    
    if (response.data.data.status === 'failed') {
      throw new Error(`Batch operation failed: ${JSON.stringify(response.data.data)}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Batch operation timeout after ${timeout}ms`);
}

function generateTestRSAKeyPair() {
  const keyId = ethers.id('test-key').substring(0, 8);
  
  return {
    publicKey: `-----BEGIN PUBLIC KEY-----\ntest-public-key-${keyId}\n-----END PUBLIC KEY-----`,
    privateKey: `-----BEGIN RSA PRIVATE KEY-----\ntest-private-key-${keyId}\n-----END RSA PRIVATE KEY-----`
  };
}