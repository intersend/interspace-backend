import '../utils/loadTestEnv';
import { describe, it, expect } from '@jest/globals';
import { testEnv } from '../infrastructure/TestEnvironment';

describe('Quick MPC Test', () => {
  it('should setup test environment', async () => {
    console.log('Starting test environment setup...');
    
    try {
      const context = await testEnv.setup({ useRealServices: true });
      
      console.log('Context:', {
        isRealMode: context.isRealMode,
        apiUrl: context.apiUrl,
        duoNodeUrl: context.duoNodeUrl
      });
      
      expect(context).toBeDefined();
      expect(context.isRealMode).toBe(true);
      
      // Test MPC client connection
      console.log('Connecting to MPC client...');
      await context.mpcClient.connect();
      console.log('MPC client connected!');
      
      // Generate test keyshare
      console.log('Generating test keyshare...');
      const keyShare = await context.mpcClient.generateTestKeyShare('test-profile-123');
      
      console.log('KeyShare generated:', {
        keyId: keyShare.keyId,
        address: keyShare.address,
        publicKey: keyShare.publicKey?.substring(0, 20) + '...'
      });
      
      expect(keyShare.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      
    } catch (error) {
      console.error('Test failed:', error);
      throw error;
    } finally {
      await testEnv.teardown();
    }
  }, 60000);
});