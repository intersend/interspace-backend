import Redis from 'ioredis';
import { config } from './config';
import { logger } from './logger';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!config.REDIS_ENABLED) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  try {
    // Use REDIS_URL if provided (for Heroku, Redis Cloud, etc.)
    if (config.REDIS_URL) {
      redisClient = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error('Redis connection failed after 3 retries');
            return null; // Stop retrying
          }
          return Math.min(times * 100, 3000); // Exponential backoff
        },
        enableOfflineQueue: false,
        lazyConnect: true
      });
    } else if (config.REDIS_HOST) {
      // Use individual connection parameters
      redisClient = new Redis({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT || 6379,
        password: config.REDIS_PASSWORD,
        db: config.REDIS_DB || 0,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error('Redis connection failed after 3 retries');
            return null; // Stop retrying
          }
          return Math.min(times * 100, 3000); // Exponential backoff
        },
        enableOfflineQueue: false,
        lazyConnect: true
      });
    } else {
      logger.warn('Redis enabled but no connection details provided');
      return null;
    }

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redisClient.on('close', () => {
      logger.info('Redis connection closed');
    });

    // Attempt to connect
    redisClient.connect().catch((error) => {
      logger.error('Failed to connect to Redis:', error);
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    logger.error('Failed to create Redis client:', error);
    return null;
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

/**
 * Check if Redis is available and healthy
 */
export async function isRedisHealthy(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
}

/**
 * Helper to execute Redis commands with fallback
 * Returns null if Redis is not available
 */
export async function withRedis<T>(
  operation: (client: Redis) => Promise<T>,
  fallback?: () => T | Promise<T>
): Promise<T | null> {
  const client = getRedisClient();
  
  if (!client) {
    if (fallback) {
      return await fallback();
    }
    return null;
  }

  try {
    return await operation(client);
  } catch (error) {
    logger.error('Redis operation failed:', error);
    if (fallback) {
      return await fallback();
    }
    return null;
  }
}