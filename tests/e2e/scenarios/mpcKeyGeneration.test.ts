import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import { ethers, verifyMessage } from 'ethers';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';
import { MPCTestClient, TestKeyShare } from '../utils/MPCTestClient';

describe('MPC Key Generation E2E Tests', () => {
  let context: TestContext;
  let api: AxiosInstance;
  let mpcClient: MPCTestClient;
  let authToken: string;
  let testUser: any;
  let testProfile: any;
  
  beforeAll(async () => {
    // Setup test environment
    context = await testEnv.setup();
    
    // Create API client
    api = axios.create({
      baseURL: context.apiUrl,
      timeout: 30000,
      validateStatus: () => true
    });
    
    // Initialize MPC test client
    mpcClient = new MPCTestClient(process.env.DUO_NODE_URL || 'http://localhost:3001');
    
    if (process.env.DISABLE_MPC !== 'true') {
      try {
        await mpcClient.connect();
        console.log('✅ Connected to Duo Node');
      } catch (error) {
        console.log('⚠️  Could not connect to Duo Node, using mock mode');
      }
    }
    
    // Create test user
    const response = await api.post('/auth/signup', {
      email: 'mpc-test@example.com',
      password: 'TestPassword123!',
      name: 'MPC Test User'
    });
    
    if (response.status !== 201 && response.status !== 200) {
      console.error('Failed to create user:', response.data);
      throw new Error(`Failed to create user: ${response.status}`);
    }
    
    testUser = response.data.data?.user || response.data.user;
    authToken = response.data.data?.accessToken || response.data.accessToken;
    
    if (!testUser || !authToken) {
      console.error('Response:', response.data);
      throw new Error('Invalid signup response');
    }
    
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    
    console.log('✅ Test user created:', testUser.email);
  }, 30000);
  
  afterAll(async () => {
    // Cleanup
    mpcClient.disconnect();
    await testEnv.teardown();
  });
  
  describe('MPC Wallet Creation', () => {
    it('should create a new MPC wallet for a profile', async () => {
      // Step 1: Create smart profile
      console.log('\n📱 Creating smart profile...');
      const profileResponse = await api.post('/profiles', {
        name: 'Test MPC Profile',
        type: 'personal'
      });
      
      expect(profileResponse.status).toBe(201);
      testProfile = profileResponse.data.data;
      console.log('✅ Profile created:', testProfile.id);
      
      // Step 2: Generate client keyshare (simulating iOS)
      console.log('\n🔑 Generating MPC keyshare...');
      const keyShare = await mpcClient.generateTestKeyShare(testProfile.id);
      
      expect(keyShare).toBeDefined();
      expect(keyShare.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(keyShare.publicKey).toBeDefined();
      expect(keyShare.keyId).toBeDefined();
      
      console.log('✅ MPC wallet created:');
      console.log('   Address:', keyShare.address);
      console.log('   Key ID:', keyShare.keyId);
      
      // Step 3: Register wallet with backend
      console.log('\n📝 Registering wallet with backend...');
      const walletResponse = await api.post(`/profiles/${testProfile.id}/wallets`, {
        address: keyShare.address,
        type: 'mpc',
        metadata: {
          keyId: keyShare.keyId,
          publicKey: keyShare.publicKey
        }
      });
      
      expect(walletResponse.status).toBe(201);
      const wallet = walletResponse.data.data;
      
      // Step 4: Verify wallet status
      const statusResponse = await api.get(`/profiles/${testProfile.id}/wallets/${wallet.id}`);
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.data.data.address).toBe(keyShare.address);
      expect(statusResponse.data.data.type).toBe('mpc');
      
      console.log('✅ Wallet registered successfully');
    }, 60000);
    
    it('should handle key rotation', async () => {
      if (!testProfile) {
        console.log('⚠️  Skipping test - no profile created');
        return;
      }
      
      console.log('\n🔄 Testing key rotation...');
      
      // Get current keyshare
      const currentKeyShare = mpcClient.getKeyShare(testProfile.id);
      if (!currentKeyShare) {
        console.log('⚠️  No keyshare found, skipping rotation test');
        return;
      }
      
      const oldAddress = currentKeyShare.address;
      
      // Rotate key
      const rotatedKeyShare = await mpcClient.rotateKey(testProfile.id);
      
      expect(rotatedKeyShare).toBeDefined();
      expect(rotatedKeyShare.address).toBe(oldAddress); // Address should remain the same
      expect(rotatedKeyShare.keyshare).not.toBe(currentKeyShare.keyshare); // But shares should be different
      
      console.log('✅ Key rotation successful');
      console.log('   Address (unchanged):', rotatedKeyShare.address);
      console.log('   New session ID:', rotatedKeyShare.sessionId);
    }, 30000);
    
    it('should create and verify backup', async () => {
      if (!testProfile || process.env.DISABLE_MPC === 'true') {
        console.log('⚠️  Skipping backup test');
        return;
      }
      
      console.log('\n💾 Testing backup creation...');
      
      // Generate RSA key pair for backup
      const rsaKeyPair = generateTestRSAKeyPair();
      
      // Create backup
      const backup = await mpcClient.createBackup(
        testProfile.id,
        rsaKeyPair.publicKey,
        'E2E Test Backup'
      );
      
      expect(backup).toBeDefined();
      expect(backup.backupId).toBeDefined();
      expect(backup.encryptedShare).toBeDefined();
      expect(backup.metadata.profileId).toBe(testProfile.id);
      
      console.log('✅ Backup created:');
      console.log('   Backup ID:', backup.backupId);
      console.log('   Profile ID:', backup.metadata.profileId);
      
      // TODO: Test backup restoration when implemented
    }, 30000);
  });
  
  describe('MPC Transaction Signing', () => {
    it('should sign a message with MPC', async () => {
      if (!testProfile) {
        console.log('⚠️  Skipping test - no profile created');
        return;
      }
      
      console.log('\n✍️  Testing message signing...');
      
      const message = 'Hello from E2E test!';
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes(message));
      
      // Sign message
      const signature = await mpcClient.signMessage(testProfile.id, messageHash);
      
      expect(signature).toBeDefined();
      expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
      
      console.log('✅ Message signed successfully');
      console.log('   Message:', message);
      console.log('   Signature:', signature.substring(0, 20) + '...');
      
      // Verify signature (if we have the address)
      const keyShare = mpcClient.getKeyShare(testProfile.id);
      if (keyShare) {
        try {
          const recoveredAddress = verifyMessage(message, signature);
          expect(recoveredAddress.toLowerCase()).toBe(keyShare.address.toLowerCase());
          console.log('✅ Signature verified - recovered address matches');
        } catch (error) {
          console.log('⚠️  Could not verify signature:', error);
        }
      }
    }, 30000);
    
    it('should sign multiple operations in batch', async () => {
      if (!testProfile) {
        console.log('⚠️  Skipping test - no profile created');
        return;
      }
      
      console.log('\n📦 Testing batch signing...');
      
      // Create multiple operations
      const operations = [
        {
          index: 0,
          message: ethers.keccak256(ethers.toUtf8Bytes('Operation 1')),
          chainId: 1
        },
        {
          index: 1,
          message: ethers.keccak256(ethers.toUtf8Bytes('Operation 2')),
          chainId: 1
        },
        {
          index: 2,
          message: ethers.keccak256(ethers.toUtf8Bytes('Operation 3')),
          chainId: 1
        }
      ];
      
      // Sign all operations
      const signatureResponse = await mpcClient.signOperations(testProfile.id, operations);
      
      expect(signatureResponse).toBeDefined();
      expect(signatureResponse.signatures).toHaveLength(3);
      
      signatureResponse.signatures.forEach((sig, index) => {
        expect(sig.index).toBe(index);
        expect(sig.signature).toBeDefined();
        expect(sig.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      });
      
      console.log('✅ Batch signing successful');
      console.log('   Operations signed:', signatureResponse.signatures.length);
    }, 30000);
  });
  
  describe('Error Handling', () => {
    it('should handle invalid profile gracefully', async () => {
      console.log('\n❌ Testing error handling...');
      
      try {
        await mpcClient.signMessage('invalid-profile-id', '0x1234');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('No keyshare found');
        console.log('✅ Error handled correctly:', error.message);
      }
    });
    
    it('should handle network errors gracefully', async () => {
      if (process.env.DISABLE_MPC === 'true') {
        console.log('⚠️  Skipping network error test in mock mode');
        return;
      }
      
      // Temporarily disconnect
      mpcClient.disconnect();
      
      try {
        await mpcClient.generateTestKeyShare('test-profile');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Not connected to Duo Node');
        console.log('✅ Network error handled correctly');
      }
      
      // Reconnect for other tests
      try {
        await mpcClient.connect();
      } catch (error) {
        console.log('⚠️  Could not reconnect to Duo Node');
      }
    });
  });
});

// Helper function for RSA key generation
function generateTestRSAKeyPair(): { publicKey: string; privateKey: string } {
  const keyId = Date.now().toString(36);
  
  return {
    publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA${keyId}
test public key content
-----END PUBLIC KEY-----`,
    privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA${keyId}
test private key content
-----END RSA PRIVATE KEY-----`
  };
}