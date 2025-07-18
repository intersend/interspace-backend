import { getRedisClient, withRedis } from '../utils/redis';
import { CachedPortfolioItem, GasAnalysisResult } from '../types/portfolio';

interface TokenIdentifier {
  chainId: bigint;
  tokenAddress: string;
}

class CacheService {
  private readonly TOKEN_ID_CACHE_PREFIX = 'tokenId:';
  private readonly GAS_ANALYSIS_CACHE_PREFIX = 'gasAnalysis:';
  private readonly COALESCE_CACHE_PREFIX = 'coalesce:';
  
  private readonly DEFAULT_TOKEN_ID_TTL = 86400; // 24 hours
  private readonly DEFAULT_GAS_ANALYSIS_TTL = 600; // 10 minutes
  
  // Track in-flight requests for coalescing
  private inFlightRequests: Map<string, Promise<any>> = new Map();

  // Balance caching removed - we always fetch fresh data from Orby

  /**
   * Get cached token IDs
   */
  async getCachedTokenIds(tokens: TokenIdentifier[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    
    await withRedis(async (redis) => {
      // Build keys for all tokens
      const keys = tokens.map(t => 
        `${this.TOKEN_ID_CACHE_PREFIX}${t.chainId}:${t.tokenAddress.toLowerCase()}`
      );
      
      // Get all values in one batch
      const values = await redis.mget(...keys);
      
      // Map results
      tokens.forEach((token, index) => {
        const value = values[index];
        if (value) {
          const cacheKey = `${token.chainId}:${token.tokenAddress}`;
          result.set(cacheKey, value);
        }
      });
      
      console.log(`Token ID cache: ${result.size}/${tokens.length} hits`);
    });
    
    return result;
  }

  /**
   * Set cached token IDs
   */
  async setCachedTokenIds(tokenMap: Map<string, string>): Promise<void> {
    if (tokenMap.size === 0) return;
    
    await withRedis(async (redis) => {
      const pipeline = redis.pipeline();
      
      for (const [key, standardizedId] of tokenMap) {
        const [chainId, tokenAddress] = key.split(':');
        const cacheKey = `${this.TOKEN_ID_CACHE_PREFIX}${chainId}:${tokenAddress?.toLowerCase() || ''}`;
        pipeline.setex(cacheKey, this.DEFAULT_TOKEN_ID_TTL, standardizedId);
      }
      
      await pipeline.exec();
      console.log(`Cached ${tokenMap.size} token IDs`);
    });
  }

  /**
   * Request coalescing - ensures only one request is made for identical concurrent requests
   */
  async coalesceRequest<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cacheKey = `${this.COALESCE_CACHE_PREFIX}${key}`;
    
    // Check if request is already in flight
    const inFlight = this.inFlightRequests.get(cacheKey);
    if (inFlight) {
      console.log(`Coalescing request for key: ${key}`);
      return inFlight;
    }
    
    // Check Redis cache first
    const cached = await withRedis(async (redis) => {
      const value = await redis.get(cacheKey);
      return value ? JSON.parse(value) : null;
    });
    
    if (cached) {
      console.log(`Cache hit for coalesced request: ${key}`);
      return cached as T;
    }
    
    // Create new request and track it
    console.log(`Starting new request for key: ${key}`);
    const request = fetcher()
      .then(async (result) => {
        // Cache the result if TTL is provided
        if (ttl && ttl > 0) {
          await withRedis(async (redis) => {
            await redis.setex(cacheKey, ttl, JSON.stringify(result));
          });
        }
        
        // Remove from in-flight tracking
        this.inFlightRequests.delete(cacheKey);
        
        return result;
      })
      .catch((error) => {
        // Remove from in-flight tracking on error
        this.inFlightRequests.delete(cacheKey);
        throw error;
      });
    
    // Track the in-flight request
    this.inFlightRequests.set(cacheKey, request);
    
    return request;
  }

  /**
   * Get cached gas analysis
   */
  async getCachedGasAnalysis(profileId: string): Promise<GasAnalysisResult | null> {
    return withRedis(async (redis) => {
      const key = `${this.GAS_ANALYSIS_CACHE_PREFIX}${profileId}`;
      const cached = await redis.get(key);
      
      if (cached) {
        console.log(`Cache hit for gas analysis: ${profileId}`);
        return JSON.parse(cached);
      }
      
      console.log(`Cache miss for gas analysis: ${profileId}`);
      return null;
    });
  }

  /**
   * Set cached gas analysis
   */
  async setCachedGasAnalysis(
    profileId: string, 
    analysis: GasAnalysisResult,
    ttl: number = this.DEFAULT_GAS_ANALYSIS_TTL
  ): Promise<void> {
    await withRedis(async (redis) => {
      const key = `${this.GAS_ANALYSIS_CACHE_PREFIX}${profileId}`;
      await redis.setex(key, ttl, JSON.stringify(analysis));
      console.log(`Cached gas analysis for profile: ${profileId} (TTL: ${ttl}s)`);
    });
  }

  /**
   * Invalidate gas analysis cache
   */
  async invalidateGasAnalysisCache(profileId: string): Promise<void> {
    await withRedis(async (redis) => {
      const key = `${this.GAS_ANALYSIS_CACHE_PREFIX}${profileId}`;
      const deleted = await redis.del(key);
      if (deleted) {
        console.log(`Invalidated gas analysis cache for profile: ${profileId}`);
      }
    });
  }

  /**
   * Invalidate all caches for a profile
   */
  async invalidateProfileCaches(profileId: string): Promise<void> {
    // Only invalidate gas analysis cache now (balance caching removed)
    await this.invalidateGasAnalysisCache(profileId);
  }

  /**
   * Clear all caches (useful for testing or emergency cache reset)
   */
  async clearAllCaches(): Promise<void> {
    await withRedis(async (redis) => {
      const patterns = [
        `${this.TOKEN_ID_CACHE_PREFIX}*`,
        `${this.GAS_ANALYSIS_CACHE_PREFIX}*`,
        `${this.COALESCE_CACHE_PREFIX}*`
      ];
      
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          console.log(`Cleared ${keys.length} keys matching pattern: ${pattern}`);
        }
      }
    });
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    tokenIdCacheCount: number;
    gasAnalysisCacheCount: number;
    inFlightRequests: number;
  }> {
    const stats = {
      tokenIdCacheCount: 0,
      gasAnalysisCacheCount: 0,
      inFlightRequests: this.inFlightRequests.size
    };
    
    await withRedis(async (redis) => {
      const patterns = [
        { key: 'tokenIdCacheCount', pattern: `${this.TOKEN_ID_CACHE_PREFIX}*` },
        { key: 'gasAnalysisCacheCount', pattern: `${this.GAS_ANALYSIS_CACHE_PREFIX}*` }
      ];
      
      for (const { key, pattern } of patterns) {
        const keys = await redis.keys(pattern);
        (stats as any)[key] = keys.length;
      }
    });
    
    return stats;
  }

  /**
   * Generic get method for caching
   */
  async get<T>(key: string): Promise<T | null> {
    return withRedis(async (redis) => {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    });
  }

  /**
   * Generic set method for caching
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await withRedis(async (redis) => {
      const serialized = JSON.stringify(value);
      if (ttl && ttl > 0) {
        await redis.setex(key, ttl, serialized);
      } else {
        await redis.set(key, serialized);
      }
    });
  }

  /**
   * Delete a specific cache key
   */
  async delete(key: string): Promise<void> {
    await withRedis(async (redis) => {
      await redis.del(key);
    });
  }

  /**
   * Delete all keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    await withRedis(async (redis) => {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
    });
  }
}

export const cacheService = new CacheService();