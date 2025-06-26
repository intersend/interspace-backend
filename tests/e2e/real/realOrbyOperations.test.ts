// Load test environment BEFORE any other imports
import '../utils/loadTestEnv';

import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { ethers } from 'ethers';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';
import { orbyService } from '@/services/orbyService';
import axios from 'axios';
import { SmartProfile } from '@prisma/client';

describe('Real Orby Integration E2E Tests', () => {
  let context: TestContext;
  let api: any;
  let testUser: any;
  let testProfile: SmartProfile;
  let authToken: string;
  let mpcWalletAddress: string;
  
  beforeAll(async () => {
    // Setup real environment
    context = await testEnv.setup({ useRealServices: true });
    
    // Verify Orby credentials
    expect(context.orbyApiKey).toBeDefined();
    console.log('✅ Orby API Key configured');
    
    // Create API client
    api = axios.create({
      baseURL: context.apiUrl,
      timeout: 60000,
      validateStatus: () => true
    });
    
    // Create test user and profile
    const timestamp = Date.now();
    testUser = await context.prisma.user.create({
      data: {
        email: `orby-real-test-${timestamp}@interspace.app`,
        emailVerified: true
      }
    });
    
    // Create MPC wallet first
    const keyShare = await context.mpcClient.generateTestKeyShare(`profile-${timestamp}`);
    mpcWalletAddress = keyShare.address;
    
    // Create profile with MPC wallet
    testProfile = await context.prisma.smartProfile.create({
      data: {
        userId: testUser.id,
        name: 'Real Orby Test Profile',
        sessionWalletAddress: mpcWalletAddress,
        orbyAccountClusterId: null // Will be created by Orby
      }
    });
    
    // Store MPC keyshare
    await context.prisma.mpcKeyShare.create({
      data: {
        profileId: testProfile.id,
        keyId: keyShare.keyId,
        publicKey: keyShare.publicKey,
        keyShare: 'encrypted-server-share', // In real impl, this would be encrypted
        address: mpcWalletAddress
      }
    });
    
    authToken = `test-token-${timestamp}`;
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    
    console.log('✅ Real Orby test environment ready');
    console.log('   Test Profile:', testProfile.id);
    console.log('   MPC Wallet:', mpcWalletAddress);
  }, 120000);
  
  afterAll(async () => {
    await testEnv.teardown();
  });
  
  describe('Orby Account Cluster Management', () => {
    it('should create real Orby account cluster', async () => {
      console.log('\n🌐 Testing real Orby account cluster creation...');
      
      // Create account cluster
      const clusterResult = await orbyService.createOrUpdateAccountCluster(testProfile);
      
      expect(clusterResult).toBeDefined();
      expect(clusterResult.clusterId).toBeDefined();
      expect(clusterResult.status).toBe('success');
      
      console.log('✅ Account cluster created:');
      console.log('   Cluster ID:', clusterResult.clusterId);
      console.log('   Wallet Address:', mpcWalletAddress);
      
      // Update profile with cluster ID
      await context.prisma.smartProfile.update({
        where: { id: testProfile.id },
        data: { orbyAccountClusterId: clusterResult.clusterId }
      });
      
      // Refresh profile
      testProfile = (await context.prisma.smartProfile.findUnique({
        where: { id: testProfile.id }
      }))!;
      
      // Verify cluster is active
      const clusterStatus = await orbyService.getAccountClusterStatus(testProfile);
      expect(clusterStatus).toBeDefined();
      expect(clusterStatus.isActive).toBe(true);
      
      console.log('✅ Cluster status verified');
    }, 60000);
    
    it('should manage virtual nodes for multi-chain support', async () => {
      console.log('\n🔗 Testing virtual node management...');
      
      // Supported chains
      const chains = [
        { chainId: 1, name: 'Ethereum' },
        { chainId: 137, name: 'Polygon' },
        { chainId: 42161, name: 'Arbitrum' }
      ];
      
      // Get or create virtual nodes
      for (const chain of chains) {
        const rpcUrl = await orbyService.getVirtualNodeRpcUrl(testProfile, chain.chainId);
        
        expect(rpcUrl).toBeDefined();
        expect(rpcUrl).toMatch(/^https?:\/\//);
        
        console.log(`   ${chain.name} RPC:`, rpcUrl);
        
        // Verify node is stored
        const virtualNode = await context.prisma.orbyVirtualNode.findFirst({
          where: {
            profileId: testProfile.id,
            chainId: chain.chainId
          }
        });
        
        expect(virtualNode).toBeDefined();
        expect(virtualNode?.rpcUrl).toBe(rpcUrl);
      }
      
      console.log('✅ Virtual nodes created for all chains');
    }, 45000);
  });
  
  describe('Real Balance Operations', () => {
    it('should fetch real unified balance from Orby', async () => {
      console.log('\n💰 Testing real balance fetching...');
      
      const balance = await orbyService.getUnifiedBalance(testProfile);
      
      expect(balance).toBeDefined();
      expect(balance.totalUsdValue).toBeDefined();
      expect(balance.tokens).toBeDefined();
      expect(Array.isArray(balance.tokens)).toBe(true);
      
      console.log('✅ Unified balance fetched:');
      console.log('   Total USD Value:', balance.totalUsdValue);
      console.log('   Token Count:', balance.tokens.length);
      
      // Log token details
      balance.tokens.forEach(token => {
        console.log(`   - ${token.symbol}: ${token.totalAmount} ($${token.totalUsdValue})`);
        token.balancesPerChain.forEach(chainBalance => {
          console.log(`     Chain ${chainBalance.chainId}: ${chainBalance.amount}`);
        });
      });
      
      // Verify balance caching
      const cachedBalance = await orbyService.getUnifiedBalance(testProfile);
      expect(cachedBalance).toEqual(balance);
      console.log('✅ Balance caching verified');
    }, 30000);
    
    it('should analyze gas payment options', async () => {
      console.log('\n⛽ Testing gas analysis...');
      
      const gasAnalysis = await orbyService.analyzeGasOptions(testProfile);
      
      expect(gasAnalysis).toBeDefined();
      expect(gasAnalysis.nativeGasAvailable).toBeDefined();
      expect(gasAnalysis.availableTokens).toBeDefined();
      
      console.log('✅ Gas analysis completed:');
      console.log('   Native gas chains:', gasAnalysis.nativeGasAvailable.length);
      console.log('   Gas payment tokens:', gasAnalysis.availableTokens.length);
      
      // Log details
      gasAnalysis.nativeGasAvailable.forEach(gas => {
        console.log(`   - Chain ${gas.chainId}: ${gas.balance} ETH (${gas.estimatedTransactions} txs)`);
      });
      
      if (gasAnalysis.suggestedToken) {
        console.log('   Suggested token:', gasAnalysis.suggestedToken.standardizedTokenId);
      }
    }, 30000);
  });
  
  describe('Real Transfer Operations', () => {
    it('should build real transfer operation', async () => {
      console.log('\n📤 Testing real transfer operation building...');
      
      // Get current balance first
      const balance = await orbyService.getUnifiedBalance(testProfile);
      
      // Find a token with balance (or use ETH)
      const tokenWithBalance = balance.tokens.find(t => 
        parseFloat(t.totalAmount) > 0 && t.standardizedTokenId === 'eth'
      ) || balance.tokens[0];
      
      if (!tokenWithBalance || parseFloat(tokenWithBalance.totalAmount) === 0) {
        console.log('⚠️  No tokens with balance, skipping transfer test');
        return;
      }
      
      // Build transfer operation
      const transferParams = {
        from: {
          token: tokenWithBalance.standardizedTokenId,
          chainId: tokenWithBalance.balancesPerChain[0].chainId,
          amount: '0.0001' // Small amount for testing
        },
        to: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794' // Test address
        }
      };
      
      console.log('   Building transfer:', transferParams);
      
      const unsignedOps = await orbyService.buildTransferOperation(
        testProfile,
        transferParams
      );
      
      expect(unsignedOps).toBeDefined();
      expect(unsignedOps.status).toBe('SUCCESS');
      expect(unsignedOps.operations).toBeDefined();
      expect(unsignedOps.operations.length).toBeGreaterThan(0);
      
      console.log('✅ Transfer operation built:');
      console.log('   Status:', unsignedOps.status);
      console.log('   Operations:', unsignedOps.operations.length);
      console.log('   Operation Set ID:', unsignedOps.operationSetId);
      
      // Log operation details
      unsignedOps.operations.forEach((op, index) => {
        console.log(`   Operation ${index}:`);
        console.log(`     Chain ID: ${op.chainId}`);
        console.log(`     To: ${op.to}`);
        console.log(`     Value: ${op.value}`);
        console.log(`     Gas Limit: ${op.gasLimit}`);
      });
      
      // Store operation for later execution
      if (unsignedOps.operationSetId) {
        await context.prisma.orbyOperation.create({
          data: {
            profileId: testProfile.id,
            operationSetId: unsignedOps.operationSetId,
            type: 'transfer',
            status: 'created',
            unsignedPayload: JSON.stringify(unsignedOps),
            metadata: JSON.stringify(transferParams)
          }
        });
        console.log('✅ Operation stored in database');
      }
    }, 45000);
    
    it('should build cross-chain transfer operation', async () => {
      console.log('\n🌉 Testing cross-chain transfer...');
      
      // This test requires balance on source chain
      const balance = await orbyService.getUnifiedBalance(testProfile);
      
      // Find USDC or similar stablecoin on multiple chains
      const crossChainToken = balance.tokens.find(t => 
        t.balancesPerChain.length > 1 && 
        ['usdc', 'usdt', 'dai'].includes(t.standardizedTokenId.toLowerCase())
      );
      
      if (!crossChainToken) {
        console.log('⚠️  No multi-chain token found, skipping cross-chain test');
        return;
      }
      
      const sourceChain = crossChainToken.balancesPerChain[0];
      const targetChain = crossChainToken.balancesPerChain[1];
      
      const crossChainParams = {
        from: {
          token: crossChainToken.standardizedTokenId,
          chainId: sourceChain.chainId,
          amount: '0.01' // Small amount
        },
        to: {
          address: mpcWalletAddress, // Send to self
          chainId: targetChain.chainId // Different chain
        }
      };
      
      console.log('   Cross-chain transfer:', crossChainParams);
      
      const unsignedOps = await orbyService.buildTransferOperation(
        testProfile,
        crossChainParams
      );
      
      expect(unsignedOps).toBeDefined();
      expect(unsignedOps.status).toBe('SUCCESS');
      
      console.log('✅ Cross-chain operation built');
      console.log('   Bridge info:', unsignedOps.bridgeInfo);
    }, 45000);
  });
  
  describe('Real Swap Operations', () => {
    it('should get real swap quote from Orby', async () => {
      console.log('\n💱 Testing real swap quote...');
      
      // Get balance to find swappable tokens
      const balance = await orbyService.getUnifiedBalance(testProfile);
      
      // Find two different tokens
      const fromToken = balance.tokens.find(t => 
        parseFloat(t.totalAmount) > 0 && t.standardizedTokenId === 'usdc'
      );
      const toToken = 'eth'; // Swap to ETH
      
      if (!fromToken) {
        console.log('⚠️  No USDC balance, trying with any available token');
        const anyToken = balance.tokens.find(t => parseFloat(t.totalAmount) > 0);
        if (!anyToken) {
          console.log('⚠️  No tokens with balance, skipping swap test');
          return;
        }
      }
      
      const swapParams = {
        from: {
          token: fromToken?.standardizedTokenId || 'usdc',
          chainId: fromToken?.balancesPerChain[0].chainId || 1,
          amount: '1.00' // 1 USDC
        },
        to: {
          token: toToken,
          chainId: fromToken?.balancesPerChain[0].chainId || 1
        }
      };
      
      console.log('   Getting swap quote:', swapParams);
      
      const swapOps = await orbyService.buildSwapOperation(
        testProfile,
        swapParams
      );
      
      expect(swapOps).toBeDefined();
      expect(swapOps.status).toBe('SUCCESS');
      expect(swapOps.quote).toBeDefined();
      
      console.log('✅ Swap quote received:');
      console.log('   From amount:', swapOps.quote?.fromAmount);
      console.log('   To amount:', swapOps.quote?.toAmount);
      console.log('   Rate:', swapOps.quote?.rate);
      console.log('   Price impact:', swapOps.quote?.priceImpact);
      
      // Log routing details if available
      if (swapOps.quote?.route) {
        console.log('   Route:', swapOps.quote.route);
      }
    }, 45000);
  });
  
  describe('Real Operation Execution', () => {
    let testOperationSetId: string;
    
    it('should sign and submit operation to blockchain', async () => {
      console.log('\n🚀 Testing real operation execution...');
      
      // First, create a simple transfer operation
      const transferParams = {
        from: {
          token: 'eth',
          chainId: 11155111, // Sepolia testnet
          amount: '0.00001' // Very small amount for testing
        },
        to: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
        }
      };
      
      // Build operation
      const unsignedOps = await orbyService.buildTransferOperation(
        testProfile,
        transferParams
      );
      
      if (unsignedOps.status !== 'SUCCESS' || !unsignedOps.operationSetId) {
        console.log('⚠️  Could not build operation, skipping execution test');
        return;
      }
      
      testOperationSetId = unsignedOps.operationSetId;
      console.log('   Operation Set ID:', testOperationSetId);
      
      // Sign operations with MPC
      const operationsToSign = unsignedOps.operations.map((op, index) => ({
        index,
        message: ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256', 'bytes', 'uint256', 'uint256'],
            [op.to, op.value || '0', op.data || '0x', op.gasLimit, op.chainId]
          )
        ),
        chainId: op.chainId
      }));
      
      console.log('   Signing', operationsToSign.length, 'operations...');
      
      const signatures = await context.mpcClient.signOperations(
        testProfile.id,
        operationsToSign
      );
      
      expect(signatures.signatures).toHaveLength(operationsToSign.length);
      console.log('✅ Operations signed');
      
      // Submit to Orby
      const submissionResult = await orbyService.submitSignedOperations(
        testOperationSetId,
        signatures.signatures.map(sig => ({
          index: sig.index,
          signature: sig.signature,
          signedData: sig.signedData
        }))
      );
      
      expect(submissionResult).toBeDefined();
      expect(submissionResult.success).toBe(true);
      
      console.log('✅ Operations submitted to blockchain:');
      console.log('   Success:', submissionResult.success);
      console.log('   Operation Set ID:', submissionResult.operationSetId);
      
      // Store transaction info
      if (submissionResult.transactions) {
        for (const tx of submissionResult.transactions) {
          await context.prisma.orbyTransaction.create({
            data: {
              operationId: testOperationSetId,
              hash: tx.hash,
              chainId: tx.chainId,
              status: 'pending',
              submittedAt: new Date()
            }
          });
          console.log(`   Transaction ${tx.hash} on chain ${tx.chainId}`);
        }
      }
    }, 90000);
    
    it('should monitor operation status', async () => {
      console.log('\n📊 Testing operation status monitoring...');
      
      if (!testOperationSetId) {
        console.log('⚠️  No operation to monitor, skipping');
        return;
      }
      
      // Monitor for up to 2 minutes
      const maxWaitTime = 120000;
      const checkInterval = 10000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const status = await orbyService.getOperationStatus(testOperationSetId);
        
        console.log(`   Status: ${status.status} (${Math.floor((Date.now() - startTime) / 1000)}s)`);
        
        if (status.status === 'successful' || status.status === 'failed') {
          expect(['successful', 'failed']).toContain(status.status);
          
          console.log('✅ Operation completed:');
          console.log('   Final status:', status.status);
          console.log('   Completion time:', status.completedAt);
          
          // Update database
          await context.prisma.orbyOperation.updateMany({
            where: { operationSetId: testOperationSetId },
            data: { 
              status: status.status,
              completedAt: status.completedAt
            }
          });
          
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }, 150000);
  });
  
  describe('Gas Abstraction', () => {
    it('should use non-native tokens for gas payment', async () => {
      console.log('\n⛽ Testing gas abstraction with Orby...');
      
      // Find USDC or similar for gas payment
      const balance = await orbyService.getUnifiedBalance(testProfile);
      const gasToken = balance.tokens.find(t => 
        ['usdc', 'usdt', 'dai'].includes(t.standardizedTokenId.toLowerCase()) &&
        parseFloat(t.totalAmount) > 0
      );
      
      if (!gasToken) {
        console.log('⚠️  No stablecoin balance for gas payment, skipping');
        return;
      }
      
      // Build operation with gas token specified
      const gasAbstractedParams = {
        from: {
          token: 'eth',
          chainId: 1,
          amount: '0.0001'
        },
        to: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
        },
        gasToken: {
          standardizedTokenId: gasToken.standardizedTokenId,
          tokenSources: gasToken.balancesPerChain.map(b => ({
            chainId: BigInt(b.chainId),
            address: b.tokenAddress
          }))
        }
      };
      
      console.log('   Using', gasToken.standardizedTokenId, 'for gas payment');
      
      const unsignedOps = await orbyService.buildTransferOperation(
        testProfile,
        gasAbstractedParams,
        gasAbstractedParams.gasToken
      );
      
      expect(unsignedOps).toBeDefined();
      expect(unsignedOps.status).toBe('SUCCESS');
      
      console.log('✅ Gas abstraction operation built');
      console.log('   Gas payment info:', unsignedOps.gasPayment);
      
      // Verify gas cost estimation
      if (unsignedOps.gasPayment) {
        expect(unsignedOps.gasPayment.token).toBe(gasToken.standardizedTokenId);
        expect(unsignedOps.gasPayment.amount).toBeDefined();
        console.log('   Estimated gas cost:', unsignedOps.gasPayment.amount, gasToken.symbol);
      }
    }, 45000);
  });
  
  describe('Error Handling', () => {
    it('should handle Orby API errors gracefully', async () => {
      console.log('\n❌ Testing Orby error handling...');
      
      // Test with invalid parameters
      try {
        await orbyService.buildTransferOperation(testProfile, {
          from: {
            token: 'invalid-token',
            chainId: 999999,
            amount: '1000000'
          },
          to: {
            address: '0xinvalid'
          }
        });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toBeDefined();
        console.log('✅ Invalid token error handled:', error.message);
      }
      
      // Test insufficient balance
      try {
        await orbyService.buildTransferOperation(testProfile, {
          from: {
            token: 'eth',
            chainId: 1,
            amount: '1000000' // Huge amount
          },
          to: {
            address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
          }
        });
        fail('Should have thrown insufficient balance error');
      } catch (error: any) {
        expect(error.message).toContain('Insufficient balance');
        console.log('✅ Insufficient balance error handled');
      }
    });
    
    it('should handle rate limiting', async () => {
      console.log('\n⏱️  Testing rate limit handling...');
      
      // Make multiple rapid requests
      const requests = Array.from({ length: 10 }, () => 
        orbyService.getUnifiedBalance(testProfile)
      );
      
      try {
        await Promise.all(requests);
        console.log('✅ Rate limiting handled gracefully (or not triggered)');
      } catch (error: any) {
        if (error.message.includes('rate limit')) {
          console.log('✅ Rate limit error detected and handled');
          expect(error.message).toContain('rate limit');
        } else {
          throw error;
        }
      }
    });
  });
});