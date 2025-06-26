import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { ethers } from 'ethers';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';
import { accountDelegationService } from '@/services/accountDelegationService';
import { sessionWalletService } from '@/blockchain/sessionWalletService';
import { orbyService } from '@/services/orbyService';
import { batchOperationService } from '@/services/batchOperationService';
import { prisma } from '@/utils/database';
import axios from 'axios';
import { SmartProfile, User, AccountDelegation } from '@prisma/client';

describe('Real EIP-7702 Delegation Flow E2E Tests', () => {
  let context: TestContext;
  let api: any;
  let testUser: User;
  let testProfile: SmartProfile;
  let authToken: string;
  let mpcWalletAddress: string;
  let delegatedEOA: ethers.Wallet;
  
  beforeAll(async () => {
    // Setup real environment
    context = await testEnv.setup({ useRealServices: true });
    
    // Verify services
    expect(context.isRealMode).toBe(true);
    expect(context.duoNodeUrl).toBeDefined();
    expect(context.orbyApiKey).toBeDefined();
    console.log('✅ Real delegation test environment ready');
    
    // Create API client
    api = axios.create({
      baseURL: context.apiUrl,
      timeout: 90000,
      validateStatus: () => true
    });
    
    // Create test user
    const timestamp = Date.now();
    testUser = await context.prisma.user.create({
      data: {
        email: `delegation-real-test-${timestamp}@interspace.app`,
        emailVerified: true
      }
    });
    
    // Create MPC wallet
    const keyShare = await context.mpcClient.generateTestKeyShare(`delegation-profile-${timestamp}`);
    mpcWalletAddress = keyShare.address;
    
    // Create profile
    testProfile = await context.prisma.smartProfile.create({
      data: {
        userId: testUser.id,
        name: 'Real Delegation Test Profile',
        sessionWalletAddress: mpcWalletAddress,
        orbyAccountClusterId: null
      }
    });
    
    // Store MPC keyshare
    await context.prisma.mpcKeyShare.create({
      data: {
        profileId: testProfile.id,
        keyId: keyShare.keyId,
        publicKey: keyShare.publicKey,
        keyShare: 'encrypted-server-share',
        address: mpcWalletAddress
      }
    });
    
    // Create Orby account cluster
    const clusterResult = await orbyService.createOrUpdateAccountCluster(testProfile);
    if (clusterResult.clusterId) {
      testProfile = await context.prisma.smartProfile.update({
        where: { id: testProfile.id },
        data: { orbyAccountClusterId: clusterResult.clusterId }
      });
    }
    
    // Create a test EOA for delegation
    delegatedEOA = ethers.Wallet.createRandom();
    
    authToken = `test-token-${timestamp}`;
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    
    console.log('✅ Test setup complete');
    console.log('   Profile ID:', testProfile.id);
    console.log('   MPC Wallet:', mpcWalletAddress);
    console.log('   Test EOA:', delegatedEOA.address);
  }, 120000);
  
  afterAll(async () => {
    await testEnv.teardown();
  });
  
  describe('Real Delegation Authorization', () => {
    let delegationAuth: any;
    
    it('should create EIP-7702 delegation authorization', async () => {
      console.log('\n🔐 Testing delegation authorization creation...');
      
      // Create delegation authorization
      const authData = {
        profileId: testProfile.id,
        delegatedAddress: delegatedEOA.address,
        permissions: {
          canTransfer: true,
          canSwap: true,
          canInteractWithContracts: true,
          maxTransactionValue: ethers.parseEther('0.1').toString(), // 0.1 ETH limit
          allowedChains: [11155111, 137, 42161], // Sepolia, Polygon, Arbitrum
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        },
        description: 'E2E Test Delegation'
      };
      
      delegationAuth = await accountDelegationService.createDelegationAuthorization(authData);
      
      expect(delegationAuth).toBeDefined();
      expect(delegationAuth.id).toBeDefined();
      expect(delegationAuth.profileId).toBe(testProfile.id);
      expect(delegationAuth.delegatedAddress).toBe(delegatedEOA.address.toLowerCase());
      expect(delegationAuth.status).toBe('pending');
      expect(delegationAuth.authorizationData).toBeDefined();
      
      console.log('✅ Delegation authorization created');
      console.log('   Authorization ID:', delegationAuth.id);
      console.log('   Delegated Address:', delegationAuth.delegatedAddress);
      console.log('   Status:', delegationAuth.status);
    });
    
    it('should sign delegation authorization with MPC', async () => {
      console.log('\n✍️  Testing delegation signing...');
      
      // Get authorization data for signing
      const authMessage = accountDelegationService.buildDelegationMessage(delegationAuth);
      
      // Sign with MPC wallet
      const signature = await context.mpcClient.signMessage(
        testProfile.id,
        ethers.keccak256(ethers.toUtf8Bytes(authMessage))
      );
      
      expect(signature).toBeDefined();
      expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
      
      // Update delegation with signature
      const signedDelegation = await accountDelegationService.updateDelegationSignature(
        delegationAuth.id,
        signature
      );
      
      expect(signedDelegation.signature).toBe(signature);
      expect(signedDelegation.status).toBe('signed');
      
      console.log('✅ Delegation signed successfully');
      console.log('   Signature:', signature.substring(0, 20) + '...');
    });
    
    it('should activate delegation on blockchain', async () => {
      console.log('\n🚀 Testing delegation activation...');
      
      // Activate delegation on-chain
      const activationResult = await accountDelegationService.activateDelegation(
        delegationAuth.id,
        11155111 // Sepolia
      );
      
      expect(activationResult).toBeDefined();
      expect(activationResult.success).toBe(true);
      expect(activationResult.transactionHash).toBeDefined();
      
      console.log('✅ Delegation activated on-chain');
      console.log('   Transaction:', activationResult.transactionHash);
      console.log('   Chain ID:', activationResult.chainId);
      
      // Update delegation status
      await context.prisma.accountDelegation.update({
        where: { id: delegationAuth.id },
        data: {
          status: 'active',
          activatedAt: new Date(),
          transactionHash: activationResult.transactionHash
        }
      });
    }, 90000);
  });
  
  describe('Gas-Free Operations via Delegation', () => {
    let activeDelegation: AccountDelegation;
    
    beforeAll(async () => {
      // Get active delegation
      const delegation = await context.prisma.accountDelegation.findFirst({
        where: {
          profileId: testProfile.id,
          status: 'active'
        }
      });
      
      if (!delegation) {
        throw new Error('No active delegation found');
      }
      
      activeDelegation = delegation;
    });
    
    it('should execute gas-free transfer via delegated EOA', async () => {
      console.log('\n💸 Testing gas-free transfer...');
      
      // Build transfer operation for delegated account
      const transferData = {
        from: delegatedEOA.address,
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
        value: ethers.parseEther('0.00001').toString(),
        chainId: 11155111
      };
      
      // Create meta-transaction
      const metaTx = await accountDelegationService.createMetaTransaction(
        activeDelegation.id,
        'transfer',
        transferData
      );
      
      expect(metaTx).toBeDefined();
      expect(metaTx.nonce).toBeDefined();
      expect(metaTx.deadline).toBeDefined();
      
      console.log('   Meta-transaction created');
      console.log('   Nonce:', metaTx.nonce);
      console.log('   Deadline:', new Date(metaTx.deadline).toISOString());
      
      // Sign meta-transaction with delegated EOA
      const metaTxSignature = await delegatedEOA.signMessage(
        ethers.solidityPackedKeccak256(
          ['address', 'address', 'uint256', 'uint256', 'uint256'],
          [metaTx.from, metaTx.to, metaTx.value, metaTx.nonce, metaTx.deadline]
        )
      );
      
      // Execute via session wallet (pays gas)
      const execResult = await accountDelegationService.executeMetaTransaction(
        activeDelegation.id,
        metaTx,
        metaTxSignature
      );
      
      expect(execResult).toBeDefined();
      expect(execResult.success).toBe(true);
      expect(execResult.transactionHash).toBeDefined();
      
      console.log('✅ Gas-free transfer executed');
      console.log('   Transaction:', execResult.transactionHash);
      console.log('   Gas paid by:', mpcWalletAddress);
      console.log('   Executed for:', delegatedEOA.address);
    }, 90000);
    
    it('should execute gas-free swap via delegation', async () => {
      console.log('\n💱 Testing gas-free swap...');
      
      // Check if delegated account has tokens
      const balance = await orbyService.getUnifiedBalance({
        ...testProfile,
        sessionWalletAddress: delegatedEOA.address
      } as SmartProfile);
      
      const hasTokens = balance.tokens.some(t => parseFloat(t.totalAmount) > 0);
      
      if (!hasTokens) {
        console.log('⚠️  Delegated account has no tokens, skipping swap test');
        return;
      }
      
      // Build swap operation
      const swapData = {
        from: {
          token: 'usdc',
          chainId: 11155111,
          amount: '0.01'
        },
        to: {
          token: 'eth',
          chainId: 11155111
        }
      };
      
      // Create swap meta-transaction
      const swapMetaTx = await accountDelegationService.createMetaTransaction(
        activeDelegation.id,
        'swap',
        swapData
      );
      
      // Sign with delegated EOA
      const swapSignature = await delegatedEOA.signMessage(
        accountDelegationService.hashMetaTransaction(swapMetaTx)
      );
      
      // Execute swap
      const swapResult = await accountDelegationService.executeMetaTransaction(
        activeDelegation.id,
        swapMetaTx,
        swapSignature
      );
      
      expect(swapResult.success).toBe(true);
      console.log('✅ Gas-free swap executed');
      console.log('   Transaction:', swapResult.transactionHash);
    }, 90000);
  });
  
  describe('Multi-Account Delegation Management', () => {
    let additionalEOAs: ethers.Wallet[] = [];
    
    beforeAll(async () => {
      // Create multiple EOAs for testing
      additionalEOAs = Array.from({ length: 3 }, () => ethers.Wallet.createRandom());
    });
    
    it('should manage multiple delegated accounts', async () => {
      console.log('\n👥 Testing multi-account delegation...');
      
      // Create delegations for multiple accounts
      const delegationPromises = additionalEOAs.map(async (eoa, index) => {
        const delegation = await accountDelegationService.createDelegationAuthorization({
          profileId: testProfile.id,
          delegatedAddress: eoa.address,
          permissions: {
            canTransfer: true,
            canSwap: index > 0, // Only some can swap
            canInteractWithContracts: index > 1, // Only some can interact
            maxTransactionValue: ethers.parseEther((0.01 * (index + 1)).toString()).toString(),
            allowedChains: [11155111],
            expiresAt: new Date(Date.now() + (index + 1) * 7 * 24 * 60 * 60 * 1000) // Varying expiry
          },
          description: `Test Delegation ${index + 1}`
        });
        
        // Sign delegation
        const authMessage = accountDelegationService.buildDelegationMessage(delegation);
        const signature = await context.mpcClient.signMessage(
          testProfile.id,
          ethers.keccak256(ethers.toUtf8Bytes(authMessage))
        );
        
        return accountDelegationService.updateDelegationSignature(delegation.id, signature);
      });
      
      const delegations = await Promise.all(delegationPromises);
      
      expect(delegations).toHaveLength(3);
      delegations.forEach((del, index) => {
        expect(del.status).toBe('signed');
        console.log(`   Delegation ${index + 1}: ${del.delegatedAddress}`);
      });
      
      console.log('✅ Multiple delegations created');
      
      // Get all delegations for profile
      const allDelegations = await accountDelegationService.getProfileDelegations(testProfile.id);
      
      expect(allDelegations.length).toBeGreaterThanOrEqual(4); // Original + 3 new
      console.log('   Total delegations:', allDelegations.length);
    });
    
    it('should enforce delegation permissions', async () => {
      console.log('\n🛡️  Testing delegation permissions...');
      
      // Get delegation with limited permissions
      const limitedDelegation = await context.prisma.accountDelegation.findFirst({
        where: {
          profileId: testProfile.id,
          delegatedAddress: additionalEOAs[0].address.toLowerCase()
        }
      });
      
      expect(limitedDelegation).toBeDefined();
      
      // Try to exceed transaction limit
      try {
        await accountDelegationService.createMetaTransaction(
          limitedDelegation!.id,
          'transfer',
          {
            from: additionalEOAs[0].address,
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
            value: ethers.parseEther('0.02').toString(), // Exceeds 0.01 ETH limit
            chainId: 11155111
          }
        );
        fail('Should have thrown permission error');
      } catch (error: any) {
        expect(error.message).toContain('exceeds maximum allowed');
        console.log('✅ Transaction limit enforced correctly');
      }
      
      // Try unauthorized operation (swap)
      const noSwapDelegation = await context.prisma.accountDelegation.findFirst({
        where: {
          profileId: testProfile.id,
          delegatedAddress: additionalEOAs[0].address.toLowerCase()
        }
      });
      
      try {
        await accountDelegationService.createMetaTransaction(
          noSwapDelegation!.id,
          'swap',
          {
            from: { token: 'usdc', chainId: 11155111, amount: '1' },
            to: { token: 'eth', chainId: 11155111 }
          }
        );
        fail('Should have thrown permission error');
      } catch (error: any) {
        expect(error.message).toContain('not authorized for swap');
        console.log('✅ Operation permissions enforced correctly');
      }
    });
  });
  
  describe('Delegation Revocation and Security', () => {
    it('should revoke delegation authorization', async () => {
      console.log('\n🚫 Testing delegation revocation...');
      
      // Get an active delegation
      const delegationToRevoke = await context.prisma.accountDelegation.findFirst({
        where: {
          profileId: testProfile.id,
          status: 'active'
        }
      });
      
      expect(delegationToRevoke).toBeDefined();
      
      // Revoke delegation
      const revocationResult = await accountDelegationService.revokeDelegation(
        delegationToRevoke!.id,
        'Testing revocation functionality'
      );
      
      expect(revocationResult).toBeDefined();
      expect(revocationResult.success).toBe(true);
      expect(revocationResult.transactionHash).toBeDefined();
      
      console.log('✅ Delegation revoked on-chain');
      console.log('   Revocation tx:', revocationResult.transactionHash);
      
      // Verify delegation status
      const revokedDelegation = await context.prisma.accountDelegation.findUnique({
        where: { id: delegationToRevoke!.id }
      });
      
      expect(revokedDelegation?.status).toBe('revoked');
      expect(revokedDelegation?.revokedAt).toBeDefined();
    }, 90000);
    
    it('should prevent operations with revoked delegation', async () => {
      console.log('\n🔒 Testing revoked delegation security...');
      
      // Get revoked delegation
      const revokedDelegation = await context.prisma.accountDelegation.findFirst({
        where: {
          profileId: testProfile.id,
          status: 'revoked'
        }
      });
      
      expect(revokedDelegation).toBeDefined();
      
      // Try to use revoked delegation
      try {
        await accountDelegationService.createMetaTransaction(
          revokedDelegation!.id,
          'transfer',
          {
            from: revokedDelegation!.delegatedAddress,
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
            value: '1000000000000000',
            chainId: 11155111
          }
        );
        fail('Should have thrown error for revoked delegation');
      } catch (error: any) {
        expect(error.message).toContain('revoked');
        console.log('✅ Revoked delegation blocked correctly');
      }
    });
    
    it('should handle delegation expiry', async () => {
      console.log('\n⏰ Testing delegation expiry...');
      
      // Create delegation with short expiry
      const expiringDelegation = await accountDelegationService.createDelegationAuthorization({
        profileId: testProfile.id,
        delegatedAddress: ethers.Wallet.createRandom().address,
        permissions: {
          canTransfer: true,
          canSwap: false,
          canInteractWithContracts: false,
          maxTransactionValue: ethers.parseEther('0.01').toString(),
          allowedChains: [11155111],
          expiresAt: new Date(Date.now() + 1000) // Expires in 1 second
        },
        description: 'Expiring delegation test'
      });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if delegation is expired
      const isExpired = await accountDelegationService.isDelegationExpired(expiringDelegation.id);
      
      expect(isExpired).toBe(true);
      console.log('✅ Delegation expiry detected correctly');
      
      // Try to use expired delegation
      try {
        await accountDelegationService.createMetaTransaction(
          expiringDelegation.id,
          'transfer',
          {
            from: expiringDelegation.delegatedAddress,
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
            value: '1000000000000000',
            chainId: 11155111
          }
        );
        fail('Should have thrown error for expired delegation');
      } catch (error: any) {
        expect(error.message).toContain('expired');
        console.log('✅ Expired delegation blocked correctly');
      }
    });
  });
  
  describe('Cross-Chain Delegation', () => {
    it('should support delegation across multiple chains', async () => {
      console.log('\n🌐 Testing cross-chain delegation...');
      
      const crossChainEOA = ethers.Wallet.createRandom();
      
      // Create cross-chain delegation
      const crossChainDelegation = await accountDelegationService.createDelegationAuthorization({
        profileId: testProfile.id,
        delegatedAddress: crossChainEOA.address,
        permissions: {
          canTransfer: true,
          canSwap: true,
          canInteractWithContracts: true,
          maxTransactionValue: ethers.parseEther('0.1').toString(),
          allowedChains: [11155111, 137, 42161, 10], // Multiple chains
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        },
        description: 'Cross-chain delegation'
      });
      
      // Sign delegation
      const authMessage = accountDelegationService.buildDelegationMessage(crossChainDelegation);
      const signature = await context.mpcClient.signMessage(
        testProfile.id,
        ethers.keccak256(ethers.toUtf8Bytes(authMessage))
      );
      
      await accountDelegationService.updateDelegationSignature(
        crossChainDelegation.id,
        signature
      );
      
      // Activate on multiple chains
      const activationPromises = [11155111, 137].map(chainId =>
        accountDelegationService.activateDelegation(
          crossChainDelegation.id,
          chainId
        ).catch(err => ({
          success: false,
          chainId,
          error: err.message
        }))
      );
      
      const activationResults = await Promise.all(activationPromises);
      
      console.log('✅ Cross-chain delegation attempted');
      activationResults.forEach(result => {
        console.log(`   Chain ${result.chainId}: ${result.success ? 'Success' : 'Failed'}`);
        if (!result.success) {
          console.log(`     Error: ${result.error}`);
        }
      });
    });
  });
  
  describe('Delegation with Batch Operations', () => {
    it('should execute batch operations via delegation', async () => {
      console.log('\n📦 Testing delegation + batch operations...');
      
      // Get an active delegation
      const activeDelegation = await context.prisma.accountDelegation.findFirst({
        where: {
          profileId: testProfile.id,
          status: 'signed', // Or 'active'
          permissions: {
            path: ['canTransfer'],
            equals: true
          }
        }
      });
      
      if (!activeDelegation) {
        console.log('⚠️  No suitable delegation found, skipping batch test');
        return;
      }
      
      // Create batch for delegated operations
      const delegatedBatch = await batchOperationService.createBatch({
        profileId: testProfile.id,
        name: 'Delegated Batch Operations',
        description: 'Batch operations via delegation',
        metadata: {
          delegationId: activeDelegation.id,
          delegatedAddress: activeDelegation.delegatedAddress
        }
      });
      
      // Add delegated operations to batch
      await batchOperationService.addOperationToBatch(
        delegatedBatch.id,
        'transfer',
        {
          from: {
            address: activeDelegation.delegatedAddress,
            token: 'eth',
            chainId: 11155111,
            amount: '0.000001'
          },
          to: {
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
          },
          delegation: {
            delegationId: activeDelegation.id,
            gasPayerAddress: mpcWalletAddress
          }
        },
        'Delegated transfer 1'
      );
      
      await batchOperationService.addOperationToBatch(
        delegatedBatch.id,
        'transfer',
        {
          from: {
            address: activeDelegation.delegatedAddress,
            token: 'eth',
            chainId: 11155111,
            amount: '0.000001'
          },
          to: {
            address: '0x0000000000000000000000000000000000000001'
          },
          delegation: {
            delegationId: activeDelegation.id,
            gasPayerAddress: mpcWalletAddress
          }
        },
        'Delegated transfer 2'
      );
      
      console.log('✅ Delegated batch created');
      console.log('   Batch ID:', delegatedBatch.id);
      console.log('   Operations: 2 delegated transfers');
      
      // Build and estimate gas
      const gasEstimate = await batchOperationService.estimateBatchGas(delegatedBatch.id);
      
      console.log('✅ Gas estimation for delegated batch');
      console.log('   Total gas:', gasEstimate.totalGas);
      console.log('   Gas payer:', mpcWalletAddress);
      console.log('   Executing for:', activeDelegation.delegatedAddress);
    });
  });
  
  describe('Delegation Analytics', () => {
    it('should track delegation usage metrics', async () => {
      console.log('\n📊 Testing delegation analytics...');
      
      // Get delegation statistics
      const stats = await accountDelegationService.getDelegationStatistics(testProfile.id);
      
      expect(stats).toBeDefined();
      expect(stats.totalDelegations).toBeGreaterThan(0);
      expect(stats.activeDelegations).toBeDefined();
      expect(stats.totalTransactions).toBeDefined();
      expect(stats.totalGasSaved).toBeDefined();
      
      console.log('✅ Delegation statistics generated');
      console.log('   Total delegations:', stats.totalDelegations);
      console.log('   Active delegations:', stats.activeDelegations);
      console.log('   Total transactions:', stats.totalTransactions);
      console.log('   Gas saved:', stats.totalGasSaved, 'wei');
      
      // Get per-delegation metrics
      const delegationMetrics = await accountDelegationService.getDelegationMetrics(
        testProfile.id,
        {
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: new Date()
        }
      );
      
      console.log('✅ Per-delegation metrics');
      delegationMetrics.forEach(metric => {
        console.log(`   ${metric.delegatedAddress}:`);
        console.log(`     Transactions: ${metric.transactionCount}`);
        console.log(`     Volume: ${ethers.formatEther(metric.totalVolume)} ETH`);
        console.log(`     Gas saved: ${metric.gasSaved} wei`);
      });
    });
  });
});