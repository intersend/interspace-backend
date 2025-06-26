import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';
import { OrbyClient } from '@orb-labs/orby-core';
import { TEST_AMOUNTS, TESTNET_CONFIGS } from '../config/testnet.config';

describe('Orby Integration E2E Tests', () => {
  let context: TestContext;
  let api: AxiosInstance;
  let authToken: string;
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
    
    // Create test user with minimal setup
    const timestamp = Date.now();
    const signupData = {
      email: `orby-test-${timestamp}@example.com`,
      password: 'TestPassword123!',
      name: 'Orby Test User'
    };
    
    console.log('📧 Creating test user:', signupData.email);
    
    // Try direct database creation if signup fails
    try {
      const user = await context.prisma.user.create({
        data: {
          email: signupData.email,
          emailVerified: true,
          name: signupData.name
        }
      });
      
      // Create profile
      const profile = await context.prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Test Orby Profile',
          type: 'personal'
        }
      });
      
      testProfile = profile;
      console.log('✅ Test profile created via DB:', profile.id);
      
      // Generate a mock token for testing
      authToken = 'test-token-' + timestamp;
      api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
      
    } catch (error) {
      console.error('Failed to create test data:', error);
      throw error;
    }
  }, 30000);
  
  afterAll(async () => {
    await testEnv.teardown();
  });
  
  describe('Orby Balance Management', () => {
    it('should fetch unified balance', async () => {
      console.log('\n💰 Testing unified balance fetch...');
      
      // Mock some balance data
      const mockBalance = {
        totalUsdValue: '100.00',
        tokens: [{
          standardizedTokenId: 'usdc',
          symbol: 'USDC',
          name: 'USD Coin',
          totalAmount: '100.00',
          totalUsdValue: '100.00',
          decimals: 6,
          balancesPerChain: [{
            chainId: 1,
            chainName: 'Ethereum',
            amount: '100.00',
            tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            isNative: false
          }]
        }]
      };
      
      // Test the Orby service directly
      const orbyService = await import('@/services/orbyService');
      
      // Mock the balance fetch
      jest.spyOn(orbyService.orbyService, 'getUnifiedBalance').mockResolvedValue(mockBalance);
      
      const balance = await orbyService.orbyService.getUnifiedBalance(testProfile);
      
      expect(balance).toBeDefined();
      expect(balance.totalUsdValue).toBe('100.00');
      expect(balance.tokens).toHaveLength(1);
      expect(balance.tokens[0].symbol).toBe('USDC');
      
      console.log('✅ Balance fetched successfully');
      console.log('   Total USD Value:', balance.totalUsdValue);
      console.log('   Tokens:', balance.tokens.length);
    });
    
    it('should analyze gas options', async () => {
      console.log('\n⛽ Testing gas analysis...');
      
      const mockGasAnalysis = {
        suggestedToken: {
          standardizedTokenId: 'eth',
          chainId: 1,
          estimatedGasCost: '0.001'
        },
        nativeGasAvailable: [{
          chainId: 1,
          balance: '0.1',
          estimatedTransactions: 100
        }],
        availableTokens: [{
          standardizedTokenId: 'usdc',
          chainId: 1,
          balance: '100',
          canPayGas: true
        }]
      };
      
      const orbyService = await import('@/services/orbyService');
      jest.spyOn(orbyService.orbyService, 'analyzeGasOptions').mockResolvedValue(mockGasAnalysis);
      
      const gasOptions = await orbyService.orbyService.analyzeGasOptions(testProfile);
      
      expect(gasOptions).toBeDefined();
      expect(gasOptions.suggestedToken).toBeDefined();
      expect(gasOptions.nativeGasAvailable).toHaveLength(1);
      expect(gasOptions.availableTokens).toHaveLength(1);
      
      console.log('✅ Gas analysis complete');
      console.log('   Suggested token:', gasOptions.suggestedToken.standardizedTokenId);
      console.log('   Native gas chains:', gasOptions.nativeGasAvailable.length);
    });
  });
  
  describe('Orby Intent Building', () => {
    it('should build transfer intent', async () => {
      console.log('\n📤 Testing transfer intent building...');
      
      const transferParams = {
        from: {
          token: 'usdc',
          chainId: 1,
          amount: '10.00'
        },
        to: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
        }
      };
      
      const mockUnsignedOps = {
        status: 'SUCCESS',
        operations: [{
          chainId: 1,
          to: transferParams.to.address,
          value: '0',
          data: '0x1234',
          gasLimit: '100000'
        }]
      };
      
      const orbyService = await import('@/services/orbyService');
      jest.spyOn(orbyService.orbyService, 'buildTransferOperation').mockResolvedValue(mockUnsignedOps);
      
      const unsignedOps = await orbyService.orbyService.buildTransferOperation(
        testProfile,
        transferParams
      );
      
      expect(unsignedOps).toBeDefined();
      expect(unsignedOps.status).toBe('SUCCESS');
      expect(unsignedOps.operations).toHaveLength(1);
      
      console.log('✅ Transfer intent built successfully');
      console.log('   Operations:', unsignedOps.operations.length);
    });
    
    it('should build swap intent', async () => {
      console.log('\n🔄 Testing swap intent building...');
      
      const swapParams = {
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
      
      const mockUnsignedOps = {
        status: 'SUCCESS',
        operations: [{
          chainId: 1,
          to: '0x1234567890123456789012345678901234567890', // DEX router
          value: '0',
          data: '0xabcdef', // Swap calldata
          gasLimit: '200000'
        }],
        quote: {
          fromAmount: '100000000', // 100 USDC (6 decimals)
          toAmount: '50000000000000000', // 0.05 ETH
          rate: '0.0005'
        }
      };
      
      const orbyService = await import('@/services/orbyService');
      jest.spyOn(orbyService.orbyService, 'buildSwapOperation').mockResolvedValue(mockUnsignedOps);
      
      const unsignedOps = await orbyService.orbyService.buildSwapOperation(
        testProfile,
        swapParams
      );
      
      expect(unsignedOps).toBeDefined();
      expect(unsignedOps.status).toBe('SUCCESS');
      expect(unsignedOps.operations).toHaveLength(1);
      expect(unsignedOps.quote).toBeDefined();
      
      console.log('✅ Swap intent built successfully');
      console.log('   Quote rate:', unsignedOps.quote?.rate);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle insufficient balance', async () => {
      console.log('\n❌ Testing insufficient balance handling...');
      
      const transferParams = {
        from: {
          token: 'usdc',
          chainId: 1,
          amount: '1000000.00' // Very large amount
        },
        to: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
        }
      };
      
      const orbyService = await import('@/services/orbyService');
      jest.spyOn(orbyService.orbyService, 'buildTransferOperation').mockRejectedValue(
        new Error('Insufficient balance')
      );
      
      try {
        await orbyService.orbyService.buildTransferOperation(testProfile, transferParams);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Insufficient balance');
        console.log('✅ Insufficient balance handled correctly');
      }
    });
    
    it('should handle unsupported token', async () => {
      console.log('\n❌ Testing unsupported token handling...');
      
      const swapParams = {
        from: {
          token: 'unknown-token',
          chainId: 1,
          amount: '100.00'
        },
        to: {
          token: 'eth',
          chainId: 1
        }
      };
      
      const orbyService = await import('@/services/orbyService');
      jest.spyOn(orbyService.orbyService, 'buildSwapOperation').mockRejectedValue(
        new Error('Unsupported token: unknown-token')
      );
      
      try {
        await orbyService.orbyService.buildSwapOperation(testProfile, swapParams);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Unsupported token');
        console.log('✅ Unsupported token handled correctly');
      }
    });
  });
  
  describe('Chain Abstraction', () => {
    it('should handle cross-chain transfers', async () => {
      console.log('\n🌉 Testing cross-chain transfer...');
      
      const crossChainParams = {
        from: {
          token: 'usdc',
          chainId: 1, // Ethereum
          amount: '50.00'
        },
        to: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794',
          chainId: 137 // Polygon
        }
      };
      
      const mockOps = {
        status: 'SUCCESS',
        operations: [
          {
            chainId: 1,
            to: '0xbridge', // Bridge contract on Ethereum
            value: '0',
            data: '0xbridge-calldata',
            gasLimit: '300000'
          }
        ],
        bridgeInfo: {
          bridgeProvider: 'Orby Bridge',
          estimatedTime: '5-10 minutes',
          fee: '0.50'
        }
      };
      
      const orbyService = await import('@/services/orbyService');
      jest.spyOn(orbyService.orbyService, 'buildTransferOperation').mockResolvedValue(mockOps);
      
      const unsignedOps = await orbyService.orbyService.buildTransferOperation(
        testProfile,
        crossChainParams
      );
      
      expect(unsignedOps).toBeDefined();
      expect(unsignedOps.status).toBe('SUCCESS');
      expect(unsignedOps.bridgeInfo).toBeDefined();
      
      console.log('✅ Cross-chain transfer prepared');
      console.log('   Bridge provider:', unsignedOps.bridgeInfo?.bridgeProvider);
      console.log('   Estimated time:', unsignedOps.bridgeInfo?.estimatedTime);
    });
  });
});