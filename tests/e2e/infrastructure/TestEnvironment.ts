import { PrismaClient } from '@prisma/client';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Application as ExpressApp } from 'express';
import { ethers } from 'ethers';
import { config } from '@/utils/config';
import { getRedisClient } from '@/utils/redis';
import { TestWallet } from '../../test-hub/utils/TestWallet';
import { TEST_WALLETS, getTestnetProvider } from '../config/testnet.config';
import { circleFaucet } from '../services/CircleFaucetService';
import { duoNodeDocker } from './DuoNodeDockerManager';
import { MPCTestClient } from '../utils/MPCTestClient';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TestContext {
  app: ExpressApp;
  server: HttpServer;
  io: SocketIOServer;
  prisma: PrismaClient;
  testWallets: Map<string, TestWallet>;
  providers: Map<number, ethers.JsonRpcProvider>;
  mpcClient: MPCTestClient;
  apiUrl: string;
  wsUrl: string;
  duoNodeUrl: string;
  isRealMode: boolean; // Indicates if using real services
  orbyApiKey?: string;
  silenceLabsCreds?: {
    nodeUrl: string;
    adminToken: string;
    projectId: string;
  };
}

export class TestEnvironment {
  private static instance: TestEnvironment;
  private context?: TestContext;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): TestEnvironment {
    if (!TestEnvironment.instance) {
      TestEnvironment.instance = new TestEnvironment();
    }
    return TestEnvironment.instance;
  }

  /**
   * Initialize the test environment
   */
  async setup(options: { useRealServices?: boolean } = {}): Promise<TestContext> {
    if (this.isInitialized && this.context) {
      return this.context;
    }

    // Load appropriate environment configuration
    const isRealMode = options.useRealServices || process.env.E2E_REAL_MODE === 'true';
    if (isRealMode) {
      console.log('🚀 Setting up E2E test environment with REAL services...');
      this.loadRealEnvConfig();
    } else {
      console.log('🚀 Setting up E2E test environment with MOCK services...');
    }

    // 1. Setup Docker services if real mode
    if (isRealMode) {
      await this.startDockerServices();
    }

    // 2. Start duo node container
    await this.setupDuoNode(isRealMode);

    // 3. Setup test database
    await this.setupDatabase();

    // 4. Initialize test server
    const { app, server, io } = await this.setupServer();

    // 5. Setup test wallets
    const testWallets = await this.setupTestWallets();

    // 6. Setup blockchain providers
    const providers = this.setupProviders();

    // 7. Initialize Redis if enabled
    if (config.REDIS_ENABLED) {
      await this.setupRedis();
    }

    // 8. Setup MPC client for testing
    const mpcClient = await this.setupMPCClient();

    this.context = {
      app,
      server,
      io,
      prisma: new PrismaClient(),
      testWallets,
      providers,
      mpcClient,
      apiUrl: `http://localhost:${config.PORT}`,
      wsUrl: `ws://localhost:${config.PORT}`,
      duoNodeUrl: 'http://localhost:3002', // Always use 3002 for duo-node
      isRealMode,
      orbyApiKey: process.env.ORBY_INSTANCE_PUBLIC_API_KEY,
      silenceLabsCreds: process.env.SILENCE_NODE_URL ? {
        nodeUrl: process.env.SILENCE_NODE_URL,
        adminToken: process.env.SILENCE_ADMIN_TOKEN || '',
        projectId: process.env.SILENCE_PROJECT_ID || ''
      } : undefined
    };

    this.isInitialized = true;
    console.log('✅ E2E test environment ready');

    return this.context;
  }

  /**
   * Setup test database
   */
  private async setupDatabase(): Promise<void> {
    console.log('📦 Setting up test database...');
    
    // Create a new Prisma client for test database
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL?.replace('interspace', 'interspace_e2e')
        }
      }
    });

    try {
      // Clear existing data - only delete tables that exist
      const deletions = [];
      
      // V2 models
      deletions.push(prisma.batchOperation.deleteMany().catch(() => {}));
      deletions.push(prisma.accountDelegation.deleteMany().catch(() => {}));
      deletions.push(prisma.accountSession.deleteMany().catch(() => {}));
      deletions.push(prisma.profileAccount.deleteMany().catch(() => {}));
      deletions.push(prisma.identityLink.deleteMany().catch(() => {}));
      deletions.push(prisma.account.deleteMany().catch(() => {}));
      
      // Orby models
      deletions.push(prisma.orbyTransaction.deleteMany().catch(() => {}));
      deletions.push(prisma.orbyOperation.deleteMany().catch(() => {}));
      deletions.push(prisma.orbyVirtualNode.deleteMany().catch(() => {}));
      
      // Core models
      deletions.push(prisma.tokenAllowance.deleteMany().catch(() => {}));
      deletions.push(prisma.transaction.deleteMany().catch(() => {}));
      deletions.push(prisma.auditLog.deleteMany().catch(() => {}));
      deletions.push(prisma.linkedAccount.deleteMany().catch(() => {}));
      deletions.push(prisma.preferredGasToken.deleteMany().catch(() => {}));
      deletions.push(prisma.mpcKeyMapping.deleteMany().catch(() => {}));
      deletions.push(prisma.mpcKeyShare.deleteMany().catch(() => {}));
      deletions.push(prisma.bookmarkedApp.deleteMany().catch(() => {}));
      deletions.push(prisma.folder.deleteMany().catch(() => {}));
      deletions.push(prisma.smartProfile.deleteMany().catch(() => {}));
      deletions.push(prisma.blacklistedToken.deleteMany().catch(() => {}));
      deletions.push(prisma.refreshToken.deleteMany().catch(() => {}));
      deletions.push(prisma.deviceRegistration.deleteMany().catch(() => {}));
      deletions.push(prisma.user.deleteMany().catch(() => {}));
      
      await Promise.all(deletions);
      
      console.log('✅ Database cleared');
    } catch (error) {
      console.error('Failed to clear database:', error);
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Setup test server
   */
  private async setupServer(): Promise<{ 
    app: ExpressApp; 
    server: HttpServer; 
    io: SocketIOServer 
  }> {
    console.log('🖥️  Starting test server...');
    
    // Import the app after environment is set
    const appModule = await import('@/index');
    const appInstance = appModule.app; // This is the Application instance
    
    // Override PORT to use a random available port for tests
    config.PORT = 0;
    
    // Start the app manually since we're in test environment
    await appInstance.start();
    
    const expressApp = appInstance.app; // This is the Express app
    const server = appInstance.server; // Use the existing server
    const io = appInstance.io; // Use the existing io instance
    
    // Get the actual port from the server
    const address = server.address();
    const actualPort = typeof address === 'object' ? address?.port : config.PORT;
    config.PORT = actualPort || 3001;
    
    console.log('✅ Test server started on port', config.PORT);
    
    return { app: expressApp as any, server, io };
  }

  /**
   * Setup test wallets
   */
  private async setupTestWallets(): Promise<Map<string, TestWallet>> {
    console.log('💳 Setting up test wallets...');
    
    const wallets = new Map<string, TestWallet>();
    
    // Create test wallets from config
    Object.entries(TEST_WALLETS).forEach(([name, wallet]) => {
      const testWallet = new TestWallet(wallet.privateKey);
      wallets.set(name, testWallet);
      console.log(`   ${name}: ${testWallet.address}`);
    });
    
    return wallets;
  }

  /**
   * Setup blockchain providers
   */
  private setupProviders(): Map<number, ethers.JsonRpcProvider> {
    console.log('🔗 Setting up blockchain providers...');
    
    const providersMap = new Map<number, ethers.JsonRpcProvider>();
    
    // Setup Sepolia provider (primary testnet)
    const sepoliaProvider = getTestnetProvider('sepolia');
    providersMap.set(11155111, sepoliaProvider);
    
    // Setup Polygon Amoy provider
    const amoyProvider = getTestnetProvider('polygon-amoy');
    providersMap.set(80002, amoyProvider);
    
    // Setup Base Sepolia provider
    const baseProvider = getTestnetProvider('base-sepolia');
    providersMap.set(84532, baseProvider);
    
    console.log('✅ Providers configured for Sepolia, Polygon Amoy, and Base Sepolia');
    
    return providersMap;
  }

  /**
   * Setup Redis for caching tests
   */
  private async setupRedis(): Promise<void> {
    console.log('🔴 Setting up Redis...');
    
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.ping();
        
        // Clear test-related keys
        const keys = await redis.keys('test:*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
      
      console.log('✅ Redis connected and cleared');
    } catch (error) {
      console.warn('⚠️  Redis not available, caching tests will be skipped');
    }
  }

  /**
   * Load real environment configuration
   */
  private loadRealEnvConfig(): void {
    // Environment should already be loaded by loadTestEnv
    console.log('✅ Using pre-loaded E2E configuration');
    
    // Verify critical variables are present
    if (!process.env.ENCRYPTION_SECRET) {
      console.error('❌ ENCRYPTION_SECRET not found in environment');
      throw new Error('Test environment not properly configured');
    }
    
    console.log('✅ Environment validated:');
    console.log('   - ENCRYPTION_SECRET length:', process.env.ENCRYPTION_SECRET?.length);
    console.log('   - DATABASE_URL:', process.env.DATABASE_URL?.includes('e2e') ? 'e2e database' : 'unknown');
    console.log('   - MPC: enabled');
  }

  /**
   * Start Docker services for real E2E tests
   */
  private async startDockerServices(): Promise<void> {
    console.log('🐳 Starting Docker services...');
    
    try {
      // Start all E2E services using docker-compose
      const { stdout, stderr } = await execAsync(
        'docker-compose -f docker-compose.e2e.yml up -d postgres-e2e redis-e2e duo-node',
        { cwd: path.resolve(__dirname, '../../..') }
      );
      
      if (stderr && !stderr.includes('Creating') && !stderr.includes('Starting')) {
        console.error('Docker stderr:', stderr);
      }
      
      console.log('⏳ Waiting for services to be ready...');
      await this.waitForServices();
      
      console.log('✅ Docker services are running');
    } catch (error) {
      console.error('Failed to start Docker services:', error);
      throw new Error('Docker services are required for real E2E tests');
    }
  }

  /**
   * Wait for all services to be ready
   */
  private async waitForServices(): Promise<void> {
    const maxRetries = 30;
    const retryDelay = 2000;
    
    // Wait for PostgreSQL
    await this.waitForService('PostgreSQL', async () => {
      const prisma = new PrismaClient();
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch (error) {
        return false;
      } finally {
        await prisma.$disconnect();
      }
    }, maxRetries, retryDelay);
    
    // Wait for Redis
    if (config.REDIS_ENABLED) {
      await this.waitForService('Redis', async () => {
        try {
          const redis = getRedisClient();
          if (redis) {
            await redis.ping();
            return true;
          }
          return false;
        } catch (error) {
          return false;
        }
      }, maxRetries, retryDelay);
    }
    
    // Wait for Duo Node
    await this.waitForService('Duo Node', async () => {
      try {
        const response = await fetch('http://localhost:3002/health');
        return response.ok;
      } catch (error) {
        return false;
      }
    }, maxRetries, retryDelay);
  }

  /**
   * Generic service health check with retry
   */
  private async waitForService(
    serviceName: string,
    checkFn: () => Promise<boolean>,
    maxRetries: number,
    retryDelay: number
  ): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const isReady = await checkFn();
        if (isReady) {
          console.log(`✅ ${serviceName} is ready`);
          return;
        }
      } catch (error) {
        // Ignore errors during health checks
      }
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    throw new Error(`${serviceName} failed to become ready after ${maxRetries} attempts`);
  }

  /**
   * Setup duo node Docker container
   */
  private async setupDuoNode(isRealMode: boolean = false): Promise<void> {
    // MPC is always enabled
    
    // In real mode, duo node is started by docker-compose
    if (isRealMode) {
      console.log('✅ Duo node already running via docker-compose');
      return;
    }
    
    console.log('🐳 Starting interspace-duo-node container...');
    
    try {
      await duoNodeDocker.start();
      console.log('✅ Duo node container is running');
    } catch (error) {
      console.error('Failed to start duo node:', error);
      throw new Error('Duo node is required for E2E tests');
    }
  }

  /**
   * Setup MPC client for testing
   */
  private async setupMPCClient(): Promise<MPCTestClient> {
    console.log('🔌 Setting up MPC test client...');
    
    // MPC is always enabled
    
    const duoNodeUrl = 'http://localhost:3002'; // Always use port 3002 for duo-node
    const mpcClient = new MPCTestClient(duoNodeUrl);
    
    // Connect to duo node WebSocket
    await mpcClient.connect();
    
    console.log('✅ MPC test client connected to duo node');
    
    return mpcClient;
  }

  /**
   * Fund test wallets if needed
   */
  async fundTestWallets(
    chainId: number = 11155111, // Default to Sepolia
    minBalance: string = '0.1'  // 0.1 ETH
  ): Promise<void> {
    if (!this.context) {
      throw new Error('Test environment not initialized');
    }

    console.log(`💰 Checking test wallet balances on chain ${chainId}...`);
    
    const walletsToFund: { address: string; chainId: number }[] = [];
    const provider = this.context.providers.get(chainId);
    
    if (!provider) {
      throw new Error(`No provider for chain ${chainId}`);
    }

    // Check each test wallet
    for (const [name, wallet] of this.context.testWallets) {
      const needsFunding = await circleFaucet.ensureMinimumBalance(
        wallet.address,
        chainId,
        minBalance,
        '10', // 10 USDC
        provider
      );
      
      if (needsFunding) {
        walletsToFund.push({ address: wallet.address, chainId });
      }
    }

    if (walletsToFund.length > 0) {
      console.log(`🚰 Funding ${walletsToFund.length} wallets...`);
      await circleFaucet.fundMultipleWallets(walletsToFund, {
        native: true,
        usdc: true,
        eurc: false
      });
    } else {
      console.log('✅ All test wallets have sufficient balance');
    }
  }

  /**
   * Get test context
   */
  getContext(): TestContext {
    if (!this.context) {
      throw new Error('Test environment not initialized. Call setup() first.');
    }
    return this.context;
  }

  /**
   * Cleanup test environment
   */
  async teardown(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
    
    if (!this.context) {
      return;
    }

    // Disconnect MPC client
    if (this.context.mpcClient) {
      this.context.mpcClient.disconnect();
    }

    // Close server
    await new Promise<void>((resolve) => {
      this.context!.server.close(() => {
        console.log('✅ Server closed');
        resolve();
      });
    });

    // Disconnect Socket.IO
    this.context.io.close();

    // Disconnect database
    await this.context.prisma.$disconnect();

    // Close Redis connection
    if (config.REDIS_ENABLED) {
      try {
        const redis = getRedisClient();
        if (redis) {
          await redis.quit();
        }
      } catch (error) {
        // Ignore Redis errors during cleanup
      }
    }

    // Always stop duo node container
    await duoNodeDocker.stop();

    this.context = undefined;
    this.isInitialized = false;
    
    console.log('✅ Test environment cleaned up');
  }

  /**
   * Reset database between tests
   */
  async resetDatabase(): Promise<void> {
    if (!this.context) {
      throw new Error('Test environment not initialized');
    }

    await this.setupDatabase();
  }

  /**
   * Get duo node logs for debugging
   */
  async getDuoNodeLogs(tail: number = 100): Promise<string> {
    return duoNodeDocker.getLogs(tail);
  }
}

// Export singleton instance
export const testEnv = TestEnvironment.getInstance();