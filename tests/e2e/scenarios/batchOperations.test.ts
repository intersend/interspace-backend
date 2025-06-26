import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';
import { MPCTestClient } from '../utils/MPCTestClient';

describe('Batch Operations E2E Tests', () => {
  let context: TestContext;
  let api: AxiosInstance;
  let authToken: string;
  let testProfile: any;
  let mpcClient: MPCTestClient;
  
  beforeAll(async () => {
    // Setup test environment
    context = await testEnv.setup();
    
    // Create API client
    api = axios.create({
      baseURL: context.apiUrl,
      timeout: 30000,
      validateStatus: () => true
    });
    
    // Initialize MPC client
    mpcClient = new MPCTestClient();
    
    // Create test user and profile
    const timestamp = Date.now();
    const user = await context.prisma.user.create({
      data: {
        email: `batch-test-${timestamp}@example.com`,
        emailVerified: true,
        name: 'Batch Test User'
      }
    });
    
    const profile = await context.prisma.smartProfile.create({
      data: {
        userId: user.id,
        name: 'Test Batch Profile',
        type: 'personal',
        orbyClusterId: `test-cluster-${timestamp}`
      }
    });
    
    testProfile = profile;
    authToken = 'test-token-' + timestamp;
    
    console.log('✅ Test profile created:', profile.id);
  }, 30000);
  
  afterAll(async () => {
    await testEnv.teardown();
  });
  
  describe('Batch Intent Creation', () => {
    it('should create a batch of transfer operations', async () => {
      console.log('\n📦 Testing batch transfer creation...');
      
      const batchService = await import('@/services/batchOperationService');
      
      // Mock Orby service responses
      const orbyService = await import('@/services/orbyService');
      jest.spyOn(orbyService.orbyService, 'buildTransferOperation')
        .mockResolvedValue({
          status: 'SUCCESS',
          operations: [{
            chainId: 1,
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
            value: '0',
            data: '0x',
            gasLimit: '21000'
          }]
        } as any);
      
      const batchRequest = {
        operations: [
          {
            type: 'transfer' as const,
            from: {
              token: 'usdc',
              chainId: 1,
              amount: '10.00'
            },
            to: {
              address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
            }
          },
          {
            type: 'transfer' as const,
            from: {
              token: 'usdc',
              chainId: 1,
              amount: '20.00'
            },
            to: {
              address: '0x853d955aCEf822Db058eb8505911ED77F175b99e'
            }
          },
          {
            type: 'transfer' as const,
            from: {
              token: 'eth',
              chainId: 1,
              amount: '0.01'
            },
            to: {
              address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
            }
          }
        ],
        atomicExecution: false
      };
      
      const result = await batchService.batchOperationService.createBatchIntent(
        testProfile.id,
        batchRequest
      );
      
      expect(result).toBeDefined();
      expect(result.batchId).toBeDefined();
      expect(result.operations).toHaveLength(3);
      expect(result.successfulOperations).toBe(3);
      expect(result.failedOperations).toBe(0);
      
      console.log('✅ Batch created successfully');
      console.log('   Batch ID:', result.batchId);
      console.log('   Operations:', result.operations.length);
      console.log('   Success rate:', `${result.successfulOperations}/${result.totalOperations}`);
    });
    
    it('should create a mixed batch with transfers and swaps', async () => {
      console.log('\n🔄 Testing mixed batch creation...');
      
      const batchService = await import('@/services/batchOperationService');
      const orbyService = await import('@/services/orbyService');
      
      // Mock transfer operations
      jest.spyOn(orbyService.orbyService, 'buildTransferOperation')
        .mockResolvedValue({
          status: 'SUCCESS',
          operations: [{
            chainId: 1,
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
            value: '0',
            data: '0x',
            gasLimit: '21000'
          }]
        } as any);
      
      // Mock swap operations
      jest.spyOn(orbyService.orbyService, 'buildSwapOperation')
        .mockResolvedValue({
          status: 'SUCCESS',
          operations: [{
            chainId: 1,
            to: '0xUniswapRouter',
            value: '0',
            data: '0xswapExactTokensForTokens',
            gasLimit: '150000'
          }],
          quote: {
            fromAmount: '1000000',
            toAmount: '1000000000000000',
            rate: '0.001'
          }
        } as any);
      
      const batchRequest = {
        operations: [
          {
            type: 'transfer' as const,
            from: { token: 'usdc', chainId: 1, amount: '50.00' },
            to: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794' }
          },
          {
            type: 'swap' as const,
            from: { token: 'usdc', chainId: 1, amount: '100.00' },
            to: { token: 'eth', chainId: 1 }
          },
          {
            type: 'transfer' as const,
            from: { token: 'eth', chainId: 1, amount: '0.05' },
            to: { address: '0x853d955aCEf822Db058eb8505911ED77F175b99e' }
          },
          {
            type: 'swap' as const,
            from: { token: 'eth', chainId: 1, amount: '0.1' },
            to: { token: 'usdc', chainId: 1 }
          }
        ],
        atomicExecution: false,
        metadata: { purpose: 'Mixed operations test' }
      };
      
      const result = await batchService.batchOperationService.createBatchIntent(
        testProfile.id,
        batchRequest
      );
      
      expect(result).toBeDefined();
      expect(result.operations).toHaveLength(4);
      expect(result.operations.filter(op => op.type === 'transfer')).toHaveLength(2);
      expect(result.operations.filter(op => op.type === 'swap')).toHaveLength(2);
      
      console.log('✅ Mixed batch created successfully');
      console.log('   Transfers:', result.operations.filter(op => op.type === 'transfer').length);
      console.log('   Swaps:', result.operations.filter(op => op.type === 'swap').length);
    });
    
    it('should handle atomic execution correctly', async () => {
      console.log('\n⚛️ Testing atomic batch execution...');
      
      const batchService = await import('@/services/batchOperationService');
      const orbyService = await import('@/services/orbyService');
      
      // Make the second operation fail
      let callCount = 0;
      jest.spyOn(orbyService.orbyService, 'buildTransferOperation')
        .mockImplementation(async () => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Insufficient balance');
          }
          return {
            status: 'SUCCESS',
            operations: [{
              chainId: 1,
              to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
              value: '0',
              data: '0x',
              gasLimit: '21000'
            }]
          } as any;
        });
      
      const batchRequest = {
        operations: [
          {
            type: 'transfer' as const,
            from: { token: 'usdc', chainId: 1, amount: '10.00' },
            to: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794' }
          },
          {
            type: 'transfer' as const,
            from: { token: 'usdc', chainId: 1, amount: '1000000.00' }, // This will fail
            to: { address: '0x853d955aCEf822Db058eb8505911ED77F175b99e' }
          },
          {
            type: 'transfer' as const,
            from: { token: 'usdc', chainId: 1, amount: '5.00' },
            to: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }
          }
        ],
        atomicExecution: true // All or nothing
      };
      
      try {
        await batchService.batchOperationService.createBatchIntent(
          testProfile.id,
          batchRequest
        );
        fail('Should have thrown an error for atomic execution');
      } catch (error: any) {
        expect(error.message).toContain('Batch operation failed');
        console.log('✅ Atomic execution failed as expected:', error.message);
      }
      
      // Verify no operations were persisted
      const operations = await context.prisma.orbyOperation.findMany({
        where: { profileId: testProfile.id }
      });
      expect(operations).toHaveLength(0);
      
      console.log('✅ Atomic rollback successful - no operations persisted');
    });
  });
  
  describe('Batch Execution', () => {
    it('should execute a batch with signed operations', async () => {
      console.log('\n✍️ Testing batch execution with signatures...');
      
      const batchService = await import('@/services/batchOperationService');
      const orbyService = await import('@/services/orbyService');
      
      // First create a batch
      jest.spyOn(orbyService.orbyService, 'buildTransferOperation')
        .mockResolvedValue({
          status: 'SUCCESS',
          operations: [{
            chainId: 1,
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
            value: '0',
            data: '0x',
            gasLimit: '21000'
          }]
        } as any);
      
      const batchRequest = {
        operations: [
          {
            type: 'transfer' as const,
            from: { token: 'usdc', chainId: 1, amount: '10.00' },
            to: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794' }
          },
          {
            type: 'transfer' as const,
            from: { token: 'usdc', chainId: 1, amount: '20.00' },
            to: { address: '0x853d955aCEf822Db058eb8505911ED77F175b99e' }
          }
        ]
      };
      
      const batch = await batchService.batchOperationService.createBatchIntent(
        testProfile.id,
        batchRequest
      );
      
      // Mock Orby submission
      jest.spyOn(orbyService.orbyService, 'submitSignedOperations')
        .mockResolvedValue({
          success: true,
          operationSetId: batch.operations[0].operationSetId,
          transactions: [{
            hash: '0x1234567890abcdef',
            chainId: 1,
            status: 'pending'
          }]
        } as any);
      
      // Sign operations (mock)
      const signedOperations = batch.operations
        .filter(op => op.status === 'created')
        .map((op, index) => ({
          index,
          operationSetId: op.operationSetId!,
          signature: '0xmocksignature' + index,
          signedData: '0xmockdata' + index
        }));
      
      // Execute the batch
      const executionResult = await batchService.batchOperationService.executeBatch(
        batch.batchId,
        signedOperations
      );
      
      expect(executionResult).toBeDefined();
      expect(executionResult.status).toBe('submitted');
      expect(executionResult.submittedOperations).toBe(2);
      expect(executionResult.failedOperations).toBe(0);
      
      console.log('✅ Batch executed successfully');
      console.log('   Status:', executionResult.status);
      console.log('   Submitted:', executionResult.submittedOperations);
    });
    
    it('should handle partial failure recovery', async () => {
      console.log('\n🔧 Testing partial failure recovery...');
      
      const batchService = await import('@/services/batchOperationService');
      
      // Create a batch that's partially failed
      const partialBatch = await context.prisma.batchOperation.create({
        data: {
          profileId: testProfile.id,
          batchId: `partial_${Date.now()}`,
          status: 'partial',
          operations: [
            { index: 0, type: 'transfer', status: 'submitted' },
            { index: 1, type: 'transfer', status: 'failed', error: 'insufficient balance' },
            { index: 2, type: 'swap', status: 'failed', error: 'network error' }
          ],
          atomicExecution: false
        }
      });
      
      // Analyze failed operations
      const recovery = await batchService.batchOperationService.handlePartialFailure(
        partialBatch.batchId,
        [1, 2] // Failed indices
      );
      
      expect(recovery.retryableOperations).toBeDefined();
      expect(recovery.permanentFailures).toBeDefined();
      
      // Network errors should be retryable
      const networkErrorOp = recovery.retryableOperations.find(op => op.index === 2);
      expect(networkErrorOp).toBeDefined();
      
      // Insufficient balance might be permanent
      const balanceErrorOp = recovery.permanentFailures.find(op => op.index === 1);
      expect(balanceErrorOp).toBeDefined();
      
      console.log('✅ Partial failure analysis complete');
      console.log('   Retryable:', recovery.retryableOperations.length);
      console.log('   Permanent failures:', recovery.permanentFailures.length);
    });
  });
  
  describe('Batch Status Tracking', () => {
    it('should track batch operation status', async () => {
      console.log('\n📊 Testing batch status tracking...');
      
      const batchService = await import('@/services/batchOperationService');
      
      // Create a test batch with various statuses
      const testBatch = await context.prisma.batchOperation.create({
        data: {
          profileId: testProfile.id,
          batchId: `status_test_${Date.now()}`,
          status: 'submitted',
          operations: [
            { 
              index: 0, 
              type: 'transfer', 
              status: 'successful',
              operationSetId: 'op_1'
            },
            { 
              index: 1, 
              type: 'swap', 
              status: 'pending',
              operationSetId: 'op_2'
            },
            { 
              index: 2, 
              type: 'transfer', 
              status: 'failed',
              operationSetId: 'op_3',
              error: 'Gas estimation failed'
            }
          ],
          atomicExecution: false
        }
      });
      
      // Create corresponding Orby operations
      await context.prisma.orbyOperation.createMany({
        data: [
          {
            profileId: testProfile.id,
            operationSetId: 'op_1',
            type: 'transfer',
            status: 'successful',
            unsignedPayload: '{}',
            createdAt: new Date()
          },
          {
            profileId: testProfile.id,
            operationSetId: 'op_2',
            type: 'swap',
            status: 'pending',
            unsignedPayload: '{}',
            createdAt: new Date()
          },
          {
            profileId: testProfile.id,
            operationSetId: 'op_3',
            type: 'transfer',
            status: 'failed',
            unsignedPayload: '{}',
            createdAt: new Date()
          }
        ]
      });
      
      // Get batch status
      const status = await batchService.batchOperationService.getBatchStatus(testBatch.batchId);
      
      expect(status).toBeDefined();
      expect(status.batchId).toBe(testBatch.batchId);
      expect(status.operations).toHaveLength(3);
      
      const successfulOp = status.operations.find(op => op.index === 0);
      expect(successfulOp?.currentStatus).toBe('successful');
      
      const pendingOp = status.operations.find(op => op.index === 1);
      expect(pendingOp?.currentStatus).toBe('pending');
      
      const failedOp = status.operations.find(op => op.index === 2);
      expect(failedOp?.currentStatus).toBe('failed');
      
      console.log('✅ Batch status retrieved successfully');
      console.log('   Operations:', status.operations.length);
      console.log('   Status breakdown:');
      console.log('     - Successful:', status.operations.filter(op => op.currentStatus === 'successful').length);
      console.log('     - Pending:', status.operations.filter(op => op.currentStatus === 'pending').length);
      console.log('     - Failed:', status.operations.filter(op => op.currentStatus === 'failed').length);
    });
  });
  
  describe('Gas Optimization', () => {
    it('should optimize gas token selection for batch', async () => {
      console.log('\n⛽ Testing gas optimization for batch...');
      
      const batchService = await import('@/services/batchOperationService');
      const orbyService = await import('@/services/orbyService');
      
      // Mock with gas token optimization
      jest.spyOn(orbyService.orbyService, 'buildTransferOperation')
        .mockResolvedValue({
          status: 'SUCCESS',
          operations: [{
            chainId: 1,
            to: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
            value: '0',
            data: '0x',
            gasLimit: '21000'
          }],
          gasPayment: {
            token: 'usdc',
            amount: '0.50',
            savingsVsNative: '30%'
          }
        } as any);
      
      const batchRequest = {
        operations: [
          {
            type: 'transfer' as const,
            from: { token: 'usdc', chainId: 1, amount: '10.00' },
            to: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794' },
            gasToken: {
              standardizedTokenId: 'usdc',
              tokenSources: [{ chainId: BigInt(1), address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }]
            }
          }
        ]
      };
      
      const result = await batchService.batchOperationService.createBatchIntent(
        testProfile.id,
        batchRequest
      );
      
      expect(result).toBeDefined();
      expect(result.operations[0].unsignedOperations?.gasPayment).toBeDefined();
      
      console.log('✅ Gas optimization applied');
      console.log('   Gas token: USDC');
      console.log('   Savings vs native: 30%');
    });
  });
});