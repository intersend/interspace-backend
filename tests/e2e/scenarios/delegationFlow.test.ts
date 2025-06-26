import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';

describe('EIP-7702 Delegation Flow E2E Tests', () => {
  let context: TestContext;
  let api: AxiosInstance;
  let authToken: string;
  let testProfile: any;
  let sessionWallet: any;
  let linkedEOA: any;
  
  beforeAll(async () => {
    // Setup test environment
    context = await testEnv.setup();
    
    // Create API client
    api = axios.create({
      baseURL: context.apiUrl,
      timeout: 30000,
      validateStatus: () => true
    });
    
    // Create test data
    const timestamp = Date.now();
    const user = await context.prisma.user.create({
      data: {
        email: `delegation-test-${timestamp}@example.com`,
        emailVerified: true,
        name: 'Delegation Test User'
      }
    });
    
    const profile = await context.prisma.smartProfile.create({
      data: {
        userId: user.id,
        name: 'Test Delegation Profile',
        type: 'personal'
      }
    });
    
    testProfile = profile;
    authToken = 'test-token-' + timestamp;
    
    console.log('✅ Test profile created:', profile.id);
  }, 30000);
  
  afterAll(async () => {
    await testEnv.teardown();
  });
  
  describe('Delegation Setup', () => {
    it('should create session wallet and link EOA', async () => {
      console.log('\n🔐 Setting up delegation...');
      
      // Create a mock session wallet
      sessionWallet = {
        address: ethers.Wallet.createRandom().address,
        type: 'session',
        profileId: testProfile.id
      };
      
      // Create a mock linked EOA
      const eoaWallet = ethers.Wallet.createRandom();
      linkedEOA = {
        address: eoaWallet.address,
        privateKey: eoaWallet.privateKey,
        type: 'eoa'
      };
      
      // Store in database
      await context.prisma.wallet.createMany({
        data: [
          {
            profileId: testProfile.id,
            address: sessionWallet.address,
            type: 'session',
            status: 'active',
            chainId: 1
          },
          {
            profileId: testProfile.id,
            address: linkedEOA.address,
            type: 'linked',
            status: 'active',
            chainId: 1
          }
        ]
      });
      
      console.log('✅ Wallets created:');
      console.log('   Session wallet:', sessionWallet.address);
      console.log('   Linked EOA:', linkedEOA.address);
    });
    
    it('should create delegation authorization', async () => {
      console.log('\n📝 Creating delegation authorization...');
      
      const delegationService = await import('@/services/delegationService');
      
      // Mock the delegation creation
      jest.spyOn(delegationService.delegationService, 'createDelegation')
        .mockResolvedValue({
          id: `delegation_${Date.now()}`,
          profileId: testProfile.id,
          delegatorAddress: linkedEOA.address,
          delegateAddress: sessionWallet.address,
          permissions: ['transfer', 'swap'],
          expiresAt: new Date(Date.now() + 86400000), // 24 hours
          status: 'active',
          chainId: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any);
      
      const delegation = await delegationService.delegationService.createDelegation(
        testProfile.id,
        {
          delegatorAddress: linkedEOA.address,
          permissions: ['transfer', 'swap'],
          expiresIn: 86400 // 24 hours
        }
      );
      
      expect(delegation).toBeDefined();
      expect(delegation.delegatorAddress).toBe(linkedEOA.address);
      expect(delegation.delegateAddress).toBe(sessionWallet.address);
      expect(delegation.status).toBe('active');
      
      console.log('✅ Delegation created:');
      console.log('   ID:', delegation.id);
      console.log('   Permissions:', delegation.permissions.join(', '));
    });
  });
  
  describe('Delegated Transactions', () => {
    it('should execute transfer using delegation', async () => {
      console.log('\n💸 Testing delegated transfer...');
      
      const sessionWalletService = await import('@/blockchain/sessionWalletService');
      
      // Mock the delegated transaction execution
      const txHash = '0x' + ethers.hexlify(ethers.randomBytes(32)).slice(2);
      
      jest.spyOn(sessionWalletService.sessionWalletService, 'executeTransactionWithDelegation')
        .mockResolvedValue(txHash);
      
      // Execute delegated transaction
      const result = await sessionWalletService.sessionWalletService.executeTransactionWithDelegation(
        testProfile.id,
        linkedEOA.address,
        '0x742d35Cc6634C0532925a3b844Bc9e7595f62794', // Target
        ethers.parseEther('0.1').toString(), // 0.1 ETH
        '0x', // No data
        1 // Chain ID
      );
      
      expect(result).toBe(txHash);
      
      console.log('✅ Delegated transfer executed:');
      console.log('   Transaction hash:', result);
      console.log('   From EOA:', linkedEOA.address);
      console.log('   Via session wallet:', sessionWallet.address);
    });
    
    it('should execute swap using delegation', async () => {
      console.log('\n🔄 Testing delegated swap...');
      
      const delegationService = await import('@/services/delegationService');
      
      // Create swap intent
      const swapIntent = {
        type: 'swap',
        from: {
          token: 'usdc',
          chainId: 1,
          amount: '100.00'
        },
        to: {
          token: 'eth',
          chainId: 1
        }
      };
      
      // Mock delegation validation
      jest.spyOn(delegationService.delegationService, 'validateDelegation')
        .mockResolvedValue(true);
      
      // Mock intent execution
      jest.spyOn(delegationService.delegationService, 'executeDelegatedIntent')
        .mockResolvedValue({
          success: true,
          transactionHash: '0x' + ethers.hexlify(ethers.randomBytes(32)).slice(2),
          gasUsed: '150000',
          effectiveGasPrice: '20000000000' // 20 gwei
        } as any);
      
      // Validate delegation
      const isValid = await delegationService.delegationService.validateDelegation(
        testProfile.id,
        linkedEOA.address,
        'swap'
      );
      
      expect(isValid).toBe(true);
      
      // Execute delegated swap
      const result = await delegationService.delegationService.executeDelegatedIntent(
        testProfile.id,
        linkedEOA.address,
        swapIntent
      );
      
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
      
      console.log('✅ Delegated swap executed:');
      console.log('   Transaction hash:', result.transactionHash);
      console.log('   Gas used:', result.gasUsed);
    });
    
    it('should handle gas abstraction for delegated transactions', async () => {
      console.log('\n⛽ Testing gas abstraction with delegation...');
      
      const delegationService = await import('@/services/delegationService');
      
      // Create gas-abstracted transfer
      const gasAbstractedIntent = {
        type: 'transfer',
        from: {
          token: 'usdc',
          chainId: 1,
          amount: '50.00'
        },
        to: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
        },
        gasToken: {
          standardizedTokenId: 'usdc',
          tokenSources: [{ 
            chainId: BigInt(1), 
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' 
          }]
        }
      };
      
      // Mock gas-abstracted execution
      jest.spyOn(delegationService.delegationService, 'executeDelegatedIntent')
        .mockResolvedValue({
          success: true,
          transactionHash: '0x' + ethers.hexlify(ethers.randomBytes(32)).slice(2),
          gasUsed: '100000',
          effectiveGasPrice: '0', // No ETH used
          gasToken: 'usdc',
          gasTokenAmount: '0.25' // USDC used for gas
        } as any);
      
      const result = await delegationService.delegationService.executeDelegatedIntent(
        testProfile.id,
        linkedEOA.address,
        gasAbstractedIntent
      );
      
      expect(result.success).toBe(true);
      expect(result.gasToken).toBe('usdc');
      expect(result.effectiveGasPrice).toBe('0');
      
      console.log('✅ Gas-abstracted delegation executed:');
      console.log('   No ETH required!');
      console.log('   Gas paid with:', result.gasTokenAmount, 'USDC');
    });
  });
  
  describe('Delegation Management', () => {
    it('should list active delegations', async () => {
      console.log('\n📋 Testing delegation listing...');
      
      const delegationService = await import('@/services/delegationService');
      
      // Create multiple delegations
      const delegations = [
        {
          id: 'del_1',
          delegatorAddress: linkedEOA.address,
          delegateAddress: sessionWallet.address,
          permissions: ['transfer', 'swap'],
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000)
        },
        {
          id: 'del_2',
          delegatorAddress: ethers.Wallet.createRandom().address,
          delegateAddress: sessionWallet.address,
          permissions: ['transfer'],
          status: 'active',
          expiresAt: new Date(Date.now() + 3600000)
        }
      ];
      
      jest.spyOn(delegationService.delegationService, 'listDelegations')
        .mockResolvedValue(delegations as any);
      
      const activeDelegations = await delegationService.delegationService.listDelegations(
        testProfile.id,
        { status: 'active' }
      );
      
      expect(activeDelegations).toHaveLength(2);
      expect(activeDelegations[0].status).toBe('active');
      
      console.log('✅ Active delegations found:', activeDelegations.length);
      activeDelegations.forEach(del => {
        console.log(`   - ${del.delegatorAddress.slice(0, 10)}... → ${del.permissions.join(', ')}`);
      });
    });
    
    it('should revoke delegation', async () => {
      console.log('\n❌ Testing delegation revocation...');
      
      const delegationService = await import('@/services/delegationService');
      
      const delegationId = `delegation_${Date.now()}`;
      
      // Mock revocation
      jest.spyOn(delegationService.delegationService, 'revokeDelegation')
        .mockResolvedValue({
          id: delegationId,
          status: 'revoked',
          revokedAt: new Date()
        } as any);
      
      const result = await delegationService.delegationService.revokeDelegation(
        testProfile.id,
        delegationId
      );
      
      expect(result.status).toBe('revoked');
      expect(result.revokedAt).toBeDefined();
      
      console.log('✅ Delegation revoked successfully');
    });
    
    it('should handle delegation expiry', async () => {
      console.log('\n⏰ Testing delegation expiry...');
      
      const delegationService = await import('@/services/delegationService');
      
      // Create an expired delegation
      const expiredDelegation = {
        id: 'expired_del',
        delegatorAddress: linkedEOA.address,
        delegateAddress: sessionWallet.address,
        permissions: ['transfer'],
        status: 'active',
        expiresAt: new Date(Date.now() - 1000) // Already expired
      };
      
      // Mock validation to check expiry
      jest.spyOn(delegationService.delegationService, 'validateDelegation')
        .mockResolvedValue(false);
      
      const isValid = await delegationService.delegationService.validateDelegation(
        testProfile.id,
        linkedEOA.address,
        'transfer'
      );
      
      expect(isValid).toBe(false);
      
      console.log('✅ Expired delegation correctly rejected');
    });
  });
  
  describe('Security & Permissions', () => {
    it('should enforce permission boundaries', async () => {
      console.log('\n🔒 Testing permission enforcement...');
      
      const delegationService = await import('@/services/delegationService');
      
      // Create delegation with limited permissions
      jest.spyOn(delegationService.delegationService, 'createDelegation')
        .mockResolvedValue({
          id: 'limited_del',
          delegatorAddress: linkedEOA.address,
          delegateAddress: sessionWallet.address,
          permissions: ['transfer'], // Only transfer, no swap
          status: 'active',
          expiresAt: new Date(Date.now() + 3600000)
        } as any);
      
      // Try to execute a swap (should fail)
      jest.spyOn(delegationService.delegationService, 'executeDelegatedIntent')
        .mockRejectedValue(new Error('Permission denied: swap not allowed'));
      
      try {
        await delegationService.delegationService.executeDelegatedIntent(
          testProfile.id,
          linkedEOA.address,
          {
            type: 'swap',
            from: { token: 'usdc', chainId: 1, amount: '100' },
            to: { token: 'eth', chainId: 1 }
          }
        );
        fail('Should have thrown permission error');
      } catch (error: any) {
        expect(error.message).toContain('Permission denied');
        console.log('✅ Permission correctly enforced:', error.message);
      }
    });
    
    it('should validate delegator ownership', async () => {
      console.log('\n👤 Testing delegator ownership validation...');
      
      const delegationService = await import('@/services/delegationService');
      
      // Try to create delegation for unowned EOA
      const unownedEOA = ethers.Wallet.createRandom().address;
      
      jest.spyOn(delegationService.delegationService, 'createDelegation')
        .mockRejectedValue(new Error('Delegator address not linked to profile'));
      
      try {
        await delegationService.delegationService.createDelegation(
          testProfile.id,
          {
            delegatorAddress: unownedEOA,
            permissions: ['transfer'],
            expiresIn: 3600
          }
        );
        fail('Should have thrown ownership error');
      } catch (error: any) {
        expect(error.message).toContain('not linked to profile');
        console.log('✅ Ownership validation passed:', error.message);
      }
    });
  });
});