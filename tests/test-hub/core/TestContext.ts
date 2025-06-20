import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { faker } from '@faker-js/faker';
import { 
  TestContext as ITestContext, 
  TestUser, 
  TestProfile, 
  AuthTokens, 
  UserData, 
  ProfileData, 
  RetryOptions,
  ApiClient 
} from '../types';
import { ApiClient as ApiClientImpl } from '../utils/ApiClient';
import { generateAccessToken, generateRefreshToken } from '../../../src/utils/jwt';
import { logger } from '../utils/logger';
import { prisma } from '../../../src/utils/database';

export class TestContext implements ITestContext {
  private db: PrismaClient;
  private redis?: Redis;
  private testUsers: Map<string, TestUser> = new Map();
  private testProfiles: Map<string, TestProfile> = new Map();
  private transactionClient?: any;
  private suite?: string;
  private test?: string;

  constructor() {
    this.db = prisma;
    
    if (process.env.REDIS_HOST) {
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      });
    }
  }

  /**
   * Create a test-specific context
   */
  createTestContext(suite: string, test: string): TestContext {
    const context = Object.create(this);
    context.suite = suite;
    context.test = test;
    return context;
  }

  /**
   * Check database connection
   */
  async checkDatabaseConnection(): Promise<void> {
    try {
      await this.db.$queryRaw`SELECT 1`;
      logger.debug('Database connection successful');
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw new Error('Database connection failed');
    }
  }

  /**
   * Check Redis connection
   */
  async checkRedisConnection(): Promise<void> {
    if (!this.redis) {
      logger.warn('Redis not configured, skipping connection check');
      return;
    }

    try {
      await this.redis.ping();
      logger.debug('Redis connection successful');
    } catch (error) {
      logger.error('Redis connection failed:', error);
      throw new Error('Redis connection failed');
    }
  }

  /**
   * Check external services
   */
  async checkExternalServices(): Promise<void> {
    // Add checks for any external services (Orby, Silence Labs, etc.)
    logger.debug('External services check completed');
  }

  /**
   * Initialize test data
   */
  async initializeTestData(): Promise<void> {
    // Clean existing test data
    await this.cleanupTestData();
    
    // Create base test data if needed
    logger.debug('Test data initialized');
  }

  /**
   * Create a test user
   */
  async createUser(data?: Partial<UserData>): Promise<TestUser> {
    const email = data?.email || faker.internet.email();
    const walletAddress = data?.walletAddress || `0x${faker.string.hexadecimal({ length: 40 }).replace('0x', '')}`;
    const password = data?.password || faker.internet.password({ length: 12 });
    const hashedPassword = data?.password ? await bcrypt.hash(password, 10) : undefined;

    const user = await this.db.user.create({
      data: {
        email,
        walletAddress: walletAddress.toLowerCase(),
        hashedPassword,
        emailVerified: true
      }
    });

    const testUser: TestUser = {
      id: user.id,
      email,
      walletAddress,
      password,
      createdAt: user.createdAt
    };

    // Handle 2FA if requested
    if (data?.enable2FA) {
      // Create 2FA setup
      const totpSecret = faker.string.alphanumeric(32);
      const backupCodes = Array.from({ length: 8 }, () => 
        faker.string.alphanumeric(8).toUpperCase()
      );

      await this.db.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: totpSecret, // In real app, this would be encrypted
          twoFactorBackupCodes: backupCodes.join(','),
          twoFactorEnabledAt: new Date()
        }
      });

      testUser.totpSecret = totpSecret;
      testUser.backupCodes = backupCodes;
    }

    this.testUsers.set(user.id, testUser);
    logger.debug(`Created test user: ${user.id}`);
    
    return testUser;
  }

  /**
   * Get a test user
   */
  async getUser(id: string): Promise<TestUser> {
    const testUser = this.testUsers.get(id);
    if (testUser) return testUser;

    const user = await this.db.user.findUnique({
      where: { id }
    });

    if (!user) {
      throw new Error(`User ${id} not found`);
    }

    const result: TestUser = {
      id: user.id,
      email: user.email || undefined,
      walletAddress: user.walletAddress || undefined,
      createdAt: user.createdAt
    };

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      result.totpSecret = user.twoFactorSecret;
      result.backupCodes = user.twoFactorBackupCodes?.split(',');
    }

    return result;
  }

  /**
   * Delete a test user
   */
  async deleteUser(id: string): Promise<void> {
    await this.db.user.delete({ where: { id } });
    this.testUsers.delete(id);
    logger.debug(`Deleted test user: ${id}`);
  }

  /**
   * Authenticate a user and get tokens
   */
  async authenticate(user: TestUser): Promise<AuthTokens> {
    const deviceId = uuidv4();
    
    // Create device if not exists
    await this.db.deviceRegistration.create({
      data: {
        deviceId,
        userId: user.id,
        deviceName: 'Test Runner',
        deviceType: 'web',
        fingerprint: 'test-fingerprint',
        lastActiveAt: new Date()
      }
    });

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // Store refresh token
    await this.db.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        familyId: uuidv4(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    });

    logger.debug(`Authenticated user: ${user.id}`);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900 // 15 minutes
    };
  }

  /**
   * Refresh authentication tokens
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.db.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    // Delete old refresh token
    await this.db.refreshToken.delete({
      where: { token: refreshToken }
    });

    // Generate new tokens
    const accessToken = generateAccessToken(stored.userId);
    const newRefreshToken = generateRefreshToken(stored.userId);

    // Store new refresh token
    await this.db.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: stored.userId,
        familyId: stored.familyId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900
    };
  }

  /**
   * Logout a user
   */
  async logout(accessToken: string): Promise<void> {
    // Add token to blacklist
    if (this.redis) {
      await this.redis.set(
        `blacklist:${accessToken}`,
        'true',
        'EX',
        900 // 15 minutes
      );
    }
    
    logger.debug('User logged out');
  }

  /**
   * Create a test profile
   */
  async createProfile(userId: string, data?: Partial<ProfileData>): Promise<TestProfile> {
    const profile = await this.db.smartProfile.create({
      data: {
        userId,
        name: data?.name || faker.company.name(),
        isActive: data?.isActive ?? false,
        sessionWalletAddress: `0x${faker.string.hexadecimal({ length: 40 }).replace('0x', '')}`
      }
    });

    const testProfile: TestProfile = {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      isActive: profile.isActive,
      walletAddress: profile.sessionWalletAddress,
      clientShare: data?.clientShare,
      createdAt: profile.createdAt
    };

    this.testProfiles.set(profile.id, testProfile);
    logger.debug(`Created test profile: ${profile.id}`);
    
    return testProfile;
  }

  /**
   * Get a test profile
   */
  async getProfile(id: string): Promise<TestProfile> {
    const testProfile = this.testProfiles.get(id);
    if (testProfile) return testProfile;

    const profile = await this.db.smartProfile.findUnique({
      where: { id }
    });

    if (!profile) {
      throw new Error(`Profile ${id} not found`);
    }

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      isActive: profile.isActive,
      walletAddress: profile.sessionWalletAddress,
      clientShare: undefined,
      createdAt: profile.createdAt
    };
  }

  /**
   * Delete a test profile
   */
  async deleteProfile(id: string): Promise<void> {
    await this.db.smartProfile.delete({ where: { id } });
    this.testProfiles.delete(id);
    logger.debug(`Deleted test profile: ${id}`);
  }

  /**
   * Create an API client
   */
  createApiClient(accessToken?: string): ApiClient {
    const baseURL = process.env.TEST_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
    return new ApiClientImpl(baseURL, accessToken);
  }

  /**
   * Generate test data
   */
  generateTestData<T>(schema: any): T {
    // This would use the schema to generate appropriate test data
    // For now, using faker directly
    return schema as T;
  }

  /**
   * Clean up test data
   */
  async cleanupTestData(): Promise<void> {
    logger.debug('Cleaning up test data...');

    // Delete test profiles
    for (const profileId of this.testProfiles.keys()) {
      try {
        await this.db.smartProfile.delete({ where: { id: profileId } });
      } catch (error) {
        // Ignore if already deleted
      }
    }

    // Delete test users
    for (const userId of this.testUsers.keys()) {
      try {
        await this.db.user.delete({ where: { id: userId } });
      } catch (error) {
        // Ignore if already deleted
      }
    }

    this.testProfiles.clear();
    this.testUsers.clear();

    logger.debug('Test data cleanup completed');
  }

  /**
   * Wait for specified milliseconds
   */
  async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry a function with exponential backoff
   */
  async retry<T>(
    fn: () => Promise<T>, 
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      delay = 1000,
      backoff = 'exponential',
      onRetry
    } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxAttempts) {
          if (onRetry) {
            onRetry(lastError, attempt);
          }

          const waitTime = backoff === 'exponential' 
            ? delay * Math.pow(2, attempt - 1)
            : delay * attempt;

          await this.wait(waitTime);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Measure function execution time
   */
  async measure<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  }

  /**
   * Run function in a transaction
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return await this.db.$transaction(async (tx) => {
      this.transactionClient = tx;
      try {
        return await fn();
      } finally {
        this.transactionClient = undefined;
      }
    });
  }

  /**
   * Final cleanup
   */
  async cleanup(): Promise<void> {
    await this.cleanupTestData();
    
    if (this.redis) {
      this.redis.disconnect();
    }
  }
}