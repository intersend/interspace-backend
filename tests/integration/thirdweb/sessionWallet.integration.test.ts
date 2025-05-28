import { sessionWalletService } from '../../../src/blockchain/sessionWalletService';
import { 
  setupThirdwebIntegrationTests, 
  teardownThirdwebIntegrationTests,
  trackCreatedWallet,
  waitForWalletCreation,
  isValidWalletAddress,
  generateTestProfileId,
  TESTNET_CHAINS
} from '../setup/thirdweb.setup';

describe('SessionWallet Integration Tests (Real Thirdweb SDK)', () => {
  
  beforeAll(async () => {
    await setupThirdwebIntegrationTests();
  }, 30000);

  afterAll(async () => {
    await teardownThirdwebIntegrationTests();
  }, 10000);

  describe('Real Wallet Creation', () => {
    test('should create real inApp wallet with valid address', async () => {
      const profileId = generateTestProfileId();
      
      console.log(`🔧 Creating real wallet for profile: ${profileId}`);
      
      const result = await waitForWalletCreation(async () => {
        return sessionWalletService.createSessionWallet(profileId, TESTNET_CHAINS.sepolia);
      });
      
      // Validate the real wallet
      expect(result).toHaveProperty('address');
      expect(result).toHaveProperty('wallet');
      expect(isValidWalletAddress(result.address)).toBe(true);
      
      // Track for dashboard verification
      trackCreatedWallet(result.address);
      
      console.log(`✅ Real wallet created: ${result.address}`);
      console.log(`💡 This wallet should appear in your Thirdweb dashboard`);
    }, 35000);

    test('should create consistent wallet address for same profile', async () => {
      const profileId = generateTestProfileId();
      
      console.log(`🔧 Testing wallet consistency for profile: ${profileId}`);
      
      // Create wallet twice with same profile ID
      const [result1, result2] = await Promise.all([
        waitForWalletCreation(() => 
          sessionWalletService.createSessionWallet(profileId, TESTNET_CHAINS.sepolia)
        ),
        waitForWalletCreation(() => 
          sessionWalletService.createSessionWallet(profileId, TESTNET_CHAINS.sepolia)
        )
      ]);
      
      // Should return same address for same profile
      expect(result1.address).toBe(result2.address);
      expect(isValidWalletAddress(result1.address)).toBe(true);
      
      trackCreatedWallet(result1.address);
      
      console.log(`✅ Consistent wallet address: ${result1.address}`);
    }, 40000);

    test('should create different wallets for different profiles', async () => {
      const profileId1 = generateTestProfileId();
      const profileId2 = generateTestProfileId();
      
      console.log(`🔧 Testing different wallets for profiles: ${profileId1} vs ${profileId2}`);
      
      const [result1, result2] = await Promise.all([
        waitForWalletCreation(() => 
          sessionWalletService.createSessionWallet(profileId1, TESTNET_CHAINS.sepolia)
        ),
        waitForWalletCreation(() => 
          sessionWalletService.createSessionWallet(profileId2, TESTNET_CHAINS.sepolia)
        )
      ]);
      
      // Should return different addresses for different profiles
      expect(result1.address).not.toBe(result2.address);
      expect(isValidWalletAddress(result1.address)).toBe(true);
      expect(isValidWalletAddress(result2.address)).toBe(true);
      
      trackCreatedWallet(result1.address);
      trackCreatedWallet(result2.address);
      
      console.log(`✅ Different wallets created:`);
      console.log(`   Profile 1: ${result1.address}`);
      console.log(`   Profile 2: ${result2.address}`);
    }, 40000);
  });

  describe('Multi-Chain Support', () => {
    test('should create wallets on different testnets', async () => {
      const profileId = generateTestProfileId();
      
      console.log(`🔧 Testing multi-chain wallet creation for profile: ${profileId}`);
      
      // Test multiple testnets
      const chains = [
        { name: 'Sepolia', id: TESTNET_CHAINS.sepolia },
        { name: 'Mumbai', id: TESTNET_CHAINS.mumbai },
        { name: 'Base Sepolia', id: TESTNET_CHAINS.baseSepolia }
      ];
      
      const results: Array<{ chain: string; address: string }> = [];
      
      for (const chain of chains) {
        console.log(`  Creating wallet on ${chain.name}...`);
        
        const result = await waitForWalletCreation(() => 
          sessionWalletService.createSessionWallet(profileId, chain.id)
        );
        
        expect(isValidWalletAddress(result.address)).toBe(true);
        trackCreatedWallet(result.address);
        
        results.push({
          chain: chain.name,
          address: result.address
        });
        
        console.log(`    ✅ ${chain.name}: ${result.address}`);
      }
      
      // Verify all addresses are valid (they might be the same across chains for same profile)
      expect(results).toHaveLength(chains.length);
      results.forEach(result => {
        expect(isValidWalletAddress(result.address)).toBe(true);
      });
      
      console.log(`✅ Multi-chain wallet creation successful`);
    }, 60000);
  });

  describe('Wallet Service Methods', () => {
    test('should get session wallet address directly', async () => {
      const profileId = generateTestProfileId();
      
      console.log(`🔧 Testing direct address retrieval for profile: ${profileId}`);
      
      const address = await waitForWalletCreation(() => 
        sessionWalletService.getSessionWalletAddress(profileId, TESTNET_CHAINS.sepolia)
      );
      
      expect(isValidWalletAddress(address)).toBe(true);
      trackCreatedWallet(address);
      
      console.log(`✅ Direct address retrieval: ${address}`);
    }, 35000);

    test('should validate session wallet deployment', async () => {
      const profileId = generateTestProfileId();
      
      console.log(`🔧 Testing wallet deployment validation for profile: ${profileId}`);
      
      // Create wallet first
      const { address } = await waitForWalletCreation(() => 
        sessionWalletService.createSessionWallet(profileId, TESTNET_CHAINS.sepolia)
      );
      
      trackCreatedWallet(address);
      
      // Validate deployment
      const isDeployed = await sessionWalletService.isSessionWalletDeployed(
        profileId, 
        TESTNET_CHAINS.sepolia
      );
      
      expect(isDeployed).toBe(true);
      
      console.log(`✅ Wallet deployment validated: ${address}`);
    }, 35000);

    test('should get wallet instance for advanced operations', async () => {
      const profileId = generateTestProfileId();
      
      console.log(`🔧 Testing wallet instance retrieval for profile: ${profileId}`);
      
      const wallet = await waitForWalletCreation(() => 
        sessionWalletService.getWalletInstance(profileId, TESTNET_CHAINS.sepolia)
      );
      
      expect(wallet).toBeDefined();
      expect(typeof wallet).toBe('object');
      
      // Get the address to track
      const address = await sessionWalletService.getSessionWalletAddress(
        profileId, 
        TESTNET_CHAINS.sepolia
      );
      trackCreatedWallet(address);
      
      console.log(`✅ Wallet instance retrieved for: ${address}`);
    }, 35000);
  });

  describe('Error Handling', () => {
    test('should handle invalid chain ID gracefully', async () => {
      const profileId = generateTestProfileId();
      const invalidChainId = 999999;
      
      console.log(`🔧 Testing invalid chain ID handling: ${invalidChainId}`);
      
      await expect(
        sessionWalletService.createSessionWallet(profileId, invalidChainId)
      ).rejects.toThrow('Unsupported chain ID');
      
      console.log(`✅ Invalid chain ID handled correctly`);
    });

    test('should validate supported chains', () => {
      console.log(`🔧 Testing supported chains retrieval`);
      
      const supportedChains = sessionWalletService.getSupportedChains();
      
      expect(Array.isArray(supportedChains)).toBe(true);
      expect(supportedChains.length).toBeGreaterThan(0);
      
      // Verify chain structure
      supportedChains.forEach(chain => {
        expect(chain).toHaveProperty('chainId');
        expect(chain).toHaveProperty('name');
        expect(chain).toHaveProperty('nativeCurrency');
        expect(typeof chain.chainId).toBe('number');
      });
      
      console.log(`✅ Supported chains validated: ${supportedChains.length} chains`);
    });
  });

  describe('Transaction Routing', () => {
    test('should generate transaction routing info', () => {
      const sourceEOA = '0x1234567890123456789012345678901234567890';
      const sessionWallet = '0x0987654321098765432109876543210987654321';
      const targetApp = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      
      console.log(`🔧 Testing transaction routing info generation`);
      
      const routing = sessionWalletService.getTransactionRouting(
        sourceEOA,
        sessionWallet,
        targetApp
      );
      
      expect(routing).toHaveProperty('route');
      expect(routing).toHaveProperty('steps');
      expect(Array.isArray(routing.steps)).toBe(true);
      expect(routing.steps).toHaveLength(2);
      
      // Verify route format
      expect(routing.route).toContain(sourceEOA);
      expect(routing.route).toContain(sessionWallet);
      expect(routing.route).toContain(targetApp);
      
      console.log(`✅ Transaction routing: ${routing.route}`);
    });
  });

  describe('Real Wallet Verification', () => {
    test('should create wallets that appear in Thirdweb dashboard', async () => {
      const profileId = generateTestProfileId();
      
      console.log(`🔧 Creating wallet for dashboard verification: ${profileId}`);
      console.log(`💡 Check your Thirdweb dashboard after this test completes`);
      
      const { address } = await waitForWalletCreation(() => 
        sessionWalletService.createSessionWallet(profileId, TESTNET_CHAINS.sepolia)
      );
      
      trackCreatedWallet(address);
      
      // Additional validation
      expect(isValidWalletAddress(address)).toBe(true);
      expect(address.startsWith('0x')).toBe(true);
      expect(address.length).toBe(42);
      
      console.log(`✅ Dashboard wallet created: ${address}`);
      console.log(`🔍 Visit https://thirdweb.com/dashboard to see this wallet`);
      console.log(`📋 Wallet details:`);
      console.log(`   - Address: ${address}`);
      console.log(`   - Chain: Sepolia Testnet (${TESTNET_CHAINS.sepolia})`);
      console.log(`   - Profile: ${profileId}`);
      console.log(`   - Type: inApp Wallet with EIP-7702`);
    }, 35000);
  });
});
