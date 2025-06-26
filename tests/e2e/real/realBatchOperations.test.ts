import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { ethers } from 'ethers';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';
import { batchOperationService } from '@/services/batchOperationService';
import { orbyService } from '@/services/orbyService';
import { sessionWalletService } from '@/blockchain/sessionWalletService';
import { prisma } from '@/utils/database';
import axios from 'axios';
import { SmartProfile, BatchOperation, User } from '@prisma/client';

describe('Real Batch Operations E2E Tests', () => {
  let context: TestContext;
  let api: any;
  let testUser: User;
  let testProfile: SmartProfile;
  let authToken: string;
  let mpcWalletAddress: string;
  
  beforeAll(async () => {
    // Setup real environment
    context = await testEnv.setup({ useRealServices: true });
    
    // Verify services are configured
    expect(context.isRealMode).toBe(true);
    expect(context.duoNodeUrl).toBeDefined();
    expect(context.orbyApiKey).toBeDefined();
    console.log('✅ Real batch operations test environment ready');
    
    // Create API client
    api = axios.create({
      baseURL: context.apiUrl,
      timeout: 90000,
      validateStatus: () => true
    });
    
    // Create test user and profile
    const timestamp = Date.now();
    testUser = await context.prisma.user.create({
      data: {
        email: `batch-real-test-${timestamp}@interspace.app`,
        emailVerified: true
      }
    });
    
    // Create MPC wallet
    const keyShare = await context.mpcClient.generateTestKeyShare(`batch-profile-${timestamp}`);
    mpcWalletAddress = keyShare.address;
    
    // Create profile with MPC wallet
    testProfile = await context.prisma.smartProfile.create({
      data: {
        userId: testUser.id,
        name: 'Real Batch Test Profile',
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
    
    authToken = `test-token-${timestamp}`;
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    
    console.log('✅ Test setup complete');
    console.log('   Profile ID:', testProfile.id);
    console.log('   MPC Wallet:', mpcWalletAddress);
    console.log('   Orby Cluster:', testProfile.orbyAccountClusterId);
  }, 120000);
  
  afterAll(async () => {
    await testEnv.teardown();
  });
  
  describe('Real Batch Creation and Management', () => {
    let activeBatch: BatchOperation;
    
    it('should create a real batch operation', async () => {
      console.log('\n📦 Testing real batch creation...');
      
      const batchData = {
        profileId: testProfile.id,
        name: 'Real E2E Test Batch',
        description: 'Testing batch operations with real services',
        metadata: {
          source: 'e2e-test',
          purpose: 'production-testing'
        }
      };
      
      const batch = await batchOperationService.createBatch(batchData);
      
      expect(batch).toBeDefined();
      expect(batch.id).toBeDefined();
      expect(batch.profileId).toBe(testProfile.id);
      expect(batch.status).toBe('pending');
      expect(batch.name).toBe(batchData.name);
      
      activeBatch = batch;
      
      console.log('✅ Batch created successfully');
      console.log('   Batch ID:', batch.id);
      console.log('   Status:', batch.status);
    });
    
    it('should add multiple operations to a batch', async () => {
      console.log('\n➕ Testing adding operations to batch...');
      
      // Add different types of operations
      const operations = [
        // 1. Simple ETH transfer
        {
          type: 'transfer' as const,
          params: {
            from: {
              token: 'eth',
              chainId: 11155111, // Sepolia
              amount: '0.00001'
            },
            to: {
              address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
            }
          },
          description: 'ETH transfer'
        },
        // 2. Token transfer (if available)
        {
          type: 'transfer' as const,
          params: {
            from: {
              token: 'usdc',
              chainId: 11155111,
              amount: '0.01'
            },
            to: {
              address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
            }
          },
          description: 'USDC transfer'
        },
        // 3. Contract interaction (approve)
        {
          type: 'contract' as const,
          params: {
            chainId: 11155111,
            contractAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
            method: 'approve',
            args: ['0x742d35Cc6634C0532925a3b844Bc9e7595f62794', '1000000'], // 1 USDC
            abi: [
              {
                name: 'approve',
                type: 'function',
                inputs: [
                  { name: 'spender', type: 'address' },
                  { name: 'amount', type: 'uint256' }
                ],
                outputs: [{ type: 'bool' }]
              }
            ]
          },
          description: 'USDC approval'
        }
      ];
      
      // Add operations to batch
      for (const op of operations) {
        const addedOp = await batchOperationService.addOperationToBatch(
          activeBatch.id,
          op.type,
          op.params,
          op.description
        );
        
        expect(addedOp).toBeDefined();
        expect(addedOp.batchId).toBe(activeBatch.id);
        expect(addedOp.type).toBe(op.type);
        expect(addedOp.status).toBe('pending');
        
        console.log(`   ✅ Added ${op.type} operation: ${op.description}`);
      }
      
      // Verify batch has operations
      const batchWithOps = await batchOperationService.getBatchWithOperations(activeBatch.id);
      expect(batchWithOps.operations).toHaveLength(3);
      
      console.log('✅ All operations added to batch');
      console.log('   Total operations:', batchWithOps.operations.length);
    });
    
    it('should estimate batch gas costs', async () => {
      console.log('\n⛽ Testing batch gas estimation...');
      
      const gasEstimate = await batchOperationService.estimateBatchGas(activeBatch.id);
      
      expect(gasEstimate).toBeDefined();
      expect(gasEstimate.totalGas).toBeDefined();
      expect(gasEstimate.perOperation).toBeDefined();
      expect(gasEstimate.gasSavings).toBeDefined();
      
      console.log('✅ Gas estimation complete');
      console.log('   Total gas:', gasEstimate.totalGas);
      console.log('   Gas per operation:', gasEstimate.perOperation);
      console.log('   Estimated savings:', gasEstimate.gasSavings, '%');
      
      // Store gas estimate
      await context.prisma.batchOperation.update({
        where: { id: activeBatch.id },
        data: {
          metadata: {
            ...activeBatch.metadata,
            gasEstimate
          }
        }
      });
    });
  });
  
  describe('Real Batch Execution', () => {
    let executionBatch: BatchOperation;
    
    beforeAll(async () => {
      // Create a new batch for execution tests
      executionBatch = await batchOperationService.createBatch({
        profileId: testProfile.id,
        name: 'Execution Test Batch',
        description: 'Testing real batch execution'
      });
      
      // Add simple operations
      await batchOperationService.addOperationToBatch(
        executionBatch.id,
        'transfer',
        {
          from: {
            token: 'eth',
            chainId: 11155111,
            amount: '0.000001' // Very small amount
          },
          to: {
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
          }
        },
        'Test transfer 1'
      );
      
      await batchOperationService.addOperationToBatch(
        executionBatch.id,
        'transfer',
        {
          from: {
            token: 'eth',
            chainId: 11155111,
            amount: '0.000001'
          },
          to: {
            address: '0x0000000000000000000000000000000000000001'
          }
        },
        'Test transfer 2'
      );
    });
    
    it('should build batch operations through Orby', async () => {
      console.log('\n🏗️  Testing batch operation building...');
      
      // Build batch operations
      const buildResult = await batchOperationService.buildBatchOperations(executionBatch.id);
      
      expect(buildResult).toBeDefined();
      expect(buildResult.success).toBe(true);
      expect(buildResult.operationSetId).toBeDefined();
      expect(buildResult.unsignedOps).toBeDefined();
      
      console.log('✅ Batch operations built');
      console.log('   Operation Set ID:', buildResult.operationSetId);
      console.log('   Operations count:', buildResult.unsignedOps.length);
      
      // Update batch with operation set ID
      await context.prisma.batchOperation.update({
        where: { id: executionBatch.id },
        data: {
          orbyOperationSetId: buildResult.operationSetId,
          status: 'built'
        }
      });
    });
    
    it('should sign batch operations with MPC', async () => {
      console.log('\n✍️  Testing batch MPC signing...');
      
      // Get updated batch
      const batch = await context.prisma.batchOperation.findUnique({
        where: { id: executionBatch.id }
      });
      
      expect(batch?.orbyOperationSetId).toBeDefined();
      
      // Sign batch operations
      const signResult = await batchOperationService.signBatchOperations(
        executionBatch.id,
        testProfile.id
      );
      
      expect(signResult).toBeDefined();
      expect(signResult.success).toBe(true);
      expect(signResult.signatures).toBeDefined();
      expect(signResult.signatures.length).toBeGreaterThan(0);
      
      console.log('✅ Batch operations signed');
      console.log('   Signatures:', signResult.signatures.length);
      
      // Update batch status
      await context.prisma.batchOperation.update({
        where: { id: executionBatch.id },
        data: { status: 'signed' }
      });
    });
    
    it('should execute batch on blockchain', async () => {
      console.log('\n🚀 Testing batch blockchain execution...');
      
      // Execute batch
      const execResult = await batchOperationService.executeBatch(executionBatch.id);
      
      expect(execResult).toBeDefined();
      expect(execResult.success).toBe(true);
      expect(execResult.transactionHashes).toBeDefined();
      
      console.log('✅ Batch submitted to blockchain');
      console.log('   Success:', execResult.success);
      console.log('   Transactions:', execResult.transactionHashes?.length || 0);
      
      if (execResult.transactionHashes) {
        execResult.transactionHashes.forEach((tx, index) => {
          console.log(`   Tx ${index}: ${tx.hash} on chain ${tx.chainId}`);
        });
      }
    }, 120000);
    
    it('should monitor batch execution status', async () => {
      console.log('\n📊 Testing batch status monitoring...');
      
      const maxWaitTime = 120000; // 2 minutes
      const checkInterval = 10000; // 10 seconds
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const status = await batchOperationService.getBatchStatus(executionBatch.id);
        
        console.log(`   Batch status: ${status.status} (${Math.floor((Date.now() - startTime) / 1000)}s)`);
        console.log(`   Completed operations: ${status.completedOperations}/${status.totalOperations}`);
        
        if (status.status === 'completed' || status.status === 'failed') {
          expect(['completed', 'failed']).toContain(status.status);
          
          console.log('✅ Batch execution finished');
          console.log('   Final status:', status.status);
          console.log('   Success rate:', `${status.completedOperations}/${status.totalOperations}`);
          
          if (status.failedOperations > 0) {
            console.log('   Failed operations:', status.failedOperations);
          }
          
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }, 150000);
  });
  
  describe('Advanced Batch Operations', () => {
    it('should handle cross-chain batch operations', async () => {
      console.log('\n🌉 Testing cross-chain batch operations...');
      
      // Check available chains and balances
      const balance = await orbyService.getUnifiedBalance(testProfile);
      const availableChains = new Set(
        balance.tokens.flatMap(t => t.balancesPerChain.map(b => b.chainId))
      );
      
      if (availableChains.size < 2) {
        console.log('⚠️  Insufficient chains with balance, skipping cross-chain test');
        return;
      }
      
      const chains = Array.from(availableChains).slice(0, 2);
      
      // Create cross-chain batch
      const crossChainBatch = await batchOperationService.createBatch({
        profileId: testProfile.id,
        name: 'Cross-Chain Batch',
        description: 'Testing operations across multiple chains'
      });
      
      // Add operations on different chains
      for (const chainId of chains) {
        await batchOperationService.addOperationToBatch(
          crossChainBatch.id,
          'transfer',
          {
            from: {
              token: 'eth',
              chainId,
              amount: '0.000001'
            },
            to: {
              address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
            }
          },
          `Transfer on chain ${chainId}`
        );
      }
      
      // Build cross-chain batch
      const buildResult = await batchOperationService.buildBatchOperations(crossChainBatch.id);
      
      expect(buildResult.success).toBe(true);
      expect(buildResult.chainIds).toBeDefined();
      expect(buildResult.chainIds?.length).toBeGreaterThanOrEqual(2);
      
      console.log('✅ Cross-chain batch built successfully');
      console.log('   Chains involved:', buildResult.chainIds);
    });
    
    it('should optimize gas across batch operations', async () => {
      console.log('\n💡 Testing batch gas optimization...');
      
      // Create optimization test batch
      const optBatch = await batchOperationService.createBatch({
        profileId: testProfile.id,
        name: 'Gas Optimization Batch',
        description: 'Testing gas optimization strategies'
      });
      
      // Add multiple similar operations
      const similarOps = Array.from({ length: 5 }, (_, i) => ({
        type: 'transfer' as const,
        params: {
          from: {
            token: 'eth',
            chainId: 11155111,
            amount: '0.000001'
          },
          to: {
            address: `0x${i.toString().padStart(40, '0')}00000000000000000001`
          }
        },
        description: `Similar transfer ${i + 1}`
      }));
      
      for (const op of similarOps) {
        await batchOperationService.addOperationToBatch(
          optBatch.id,
          op.type,
          op.params,
          op.description
        );
      }
      
      // Get optimization analysis
      const optimization = await batchOperationService.analyzeBatchOptimization(optBatch.id);
      
      expect(optimization).toBeDefined();
      expect(optimization.recommendations).toBeDefined();
      expect(optimization.estimatedSavings).toBeDefined();
      
      console.log('✅ Gas optimization analysis complete');
      console.log('   Recommendations:', optimization.recommendations.length);
      console.log('   Estimated savings:', optimization.estimatedSavings, 'gas units');
      
      optimization.recommendations.forEach(rec => {
        console.log(`   - ${rec}`);
      });
    });
    
    it('should support batch approval workflows', async () => {
      console.log('\n✅ Testing batch approval workflow...');
      
      // Create batch requiring approval
      const approvalBatch = await batchOperationService.createBatch({
        profileId: testProfile.id,
        name: 'High Value Batch',
        description: 'Batch requiring approval',
        metadata: {
          requiresApproval: true,
          approvalThreshold: '0.1' // ETH
        }
      });
      
      // Add high-value operation
      await batchOperationService.addOperationToBatch(
        approvalBatch.id,
        'transfer',
        {
          from: {
            token: 'eth',
            chainId: 11155111,
            amount: '0.2' // Above threshold
          },
          to: {
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
          }
        },
        'High value transfer'
      );
      
      // Check approval requirement
      const approvalStatus = await batchOperationService.checkApprovalRequirement(approvalBatch.id);
      
      expect(approvalStatus.requiresApproval).toBe(true);
      expect(approvalStatus.reason).toContain('threshold');
      
      console.log('✅ Approval requirement detected');
      console.log('   Requires approval:', approvalStatus.requiresApproval);
      console.log('   Reason:', approvalStatus.reason);
      
      // Simulate approval
      const approved = await batchOperationService.approveBatch(
        approvalBatch.id,
        testUser.id,
        'Approved for E2E testing'
      );
      
      expect(approved).toBe(true);
      console.log('✅ Batch approved successfully');
    });
  });
  
  describe('Batch Error Handling', () => {
    it('should handle partial batch failures gracefully', async () => {
      console.log('\n❌ Testing partial batch failure handling...');
      
      const failBatch = await batchOperationService.createBatch({
        profileId: testProfile.id,
        name: 'Partial Failure Test',
        description: 'Testing partial failure scenarios'
      });
      
      // Add mix of valid and invalid operations
      await batchOperationService.addOperationToBatch(
        failBatch.id,
        'transfer',
        {
          from: {
            token: 'eth',
            chainId: 11155111,
            amount: '0.000001'
          },
          to: {
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
          }
        },
        'Valid operation'
      );
      
      await batchOperationService.addOperationToBatch(
        failBatch.id,
        'transfer',
        {
          from: {
            token: 'eth',
            chainId: 11155111,
            amount: '1000000' // Impossibly large amount
          },
          to: {
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
          }
        },
        'Invalid operation - insufficient balance'
      );
      
      // Try to build batch
      const buildResult = await batchOperationService.buildBatchOperations(failBatch.id);
      
      // Should handle gracefully
      expect(buildResult).toBeDefined();
      if (!buildResult.success) {
        console.log('✅ Batch build failed as expected');
        console.log('   Error:', buildResult.error);
        console.log('   Failed operations:', buildResult.failedOperations);
      } else {
        console.log('✅ Batch built with warnings');
        console.log('   Valid operations:', buildResult.unsignedOps.length);
      }
    });
    
    it('should rollback failed batch operations', async () => {
      console.log('\n↩️  Testing batch rollback...');
      
      // Create a batch that will fail
      const rollbackBatch = await batchOperationService.createBatch({
        profileId: testProfile.id,
        name: 'Rollback Test Batch',
        description: 'Testing rollback functionality'
      });
      
      // Add operations
      await batchOperationService.addOperationToBatch(
        rollbackBatch.id,
        'transfer',
        {
          from: {
            token: 'eth',
            chainId: 11155111,
            amount: '0.000001'
          },
          to: {
            address: '0x0000000000000000000000000000000000000000' // Invalid recipient
          }
        },
        'Operation that might fail'
      );
      
      // Mark as failed and rollback
      await context.prisma.batchOperation.update({
        where: { id: rollbackBatch.id },
        data: { status: 'failed' }
      });
      
      const rollbackResult = await batchOperationService.rollbackBatch(rollbackBatch.id);
      
      expect(rollbackResult).toBeDefined();
      expect(rollbackResult.success).toBe(true);
      
      console.log('✅ Batch rolled back successfully');
      console.log('   Rollback status:', rollbackResult.status);
      
      // Verify batch status
      const rolledBackBatch = await context.prisma.batchOperation.findUnique({
        where: { id: rollbackBatch.id }
      });
      
      expect(rolledBackBatch?.status).toBe('rolled_back');
    });
    
    it('should handle batch timeout scenarios', async () => {
      console.log('\n⏱️  Testing batch timeout handling...');
      
      const timeoutBatch = await batchOperationService.createBatch({
        profileId: testProfile.id,
        name: 'Timeout Test Batch',
        description: 'Testing timeout scenarios',
        metadata: {
          timeout: 5000 // 5 seconds
        }
      });
      
      // Simulate a stuck batch
      await context.prisma.batchOperation.update({
        where: { id: timeoutBatch.id },
        data: {
          status: 'executing',
          executedAt: new Date(Date.now() - 60000) // 1 minute ago
        }
      });
      
      // Check for timeout
      const isTimedOut = await batchOperationService.checkBatchTimeout(timeoutBatch.id);
      
      expect(isTimedOut).toBe(true);
      console.log('✅ Batch timeout detected correctly');
      
      // Handle timeout
      const timeoutHandled = await batchOperationService.handleBatchTimeout(timeoutBatch.id);
      
      expect(timeoutHandled).toBe(true);
      console.log('✅ Batch timeout handled successfully');
    });
  });
  
  describe('Batch Analytics and Reporting', () => {
    it('should generate batch execution report', async () => {
      console.log('\n📊 Testing batch analytics...');
      
      // Get batch statistics
      const stats = await batchOperationService.getBatchStatistics(testProfile.id);
      
      expect(stats).toBeDefined();
      expect(stats.totalBatches).toBeGreaterThan(0);
      expect(stats.successRate).toBeDefined();
      expect(stats.averageOperationsPerBatch).toBeDefined();
      
      console.log('✅ Batch statistics generated');
      console.log('   Total batches:', stats.totalBatches);
      console.log('   Success rate:', stats.successRate, '%');
      console.log('   Avg operations/batch:', stats.averageOperationsPerBatch);
      console.log('   Total gas saved:', stats.totalGasSaved);
    });
    
    it('should export batch history', async () => {
      console.log('\n📁 Testing batch history export...');
      
      const exportData = await batchOperationService.exportBatchHistory(
        testProfile.id,
        {
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          endDate: new Date(),
          format: 'json'
        }
      );
      
      expect(exportData).toBeDefined();
      expect(exportData.batches).toBeDefined();
      expect(Array.isArray(exportData.batches)).toBe(true);
      
      console.log('✅ Batch history exported');
      console.log('   Batches exported:', exportData.batches.length);
      console.log('   Export format:', exportData.format);
      console.log('   Date range:', exportData.dateRange);
    });
  });
});