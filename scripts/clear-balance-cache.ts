#!/usr/bin/env ts-node

/**
 * Script to clear balance cache for testing
 */

import { cacheService } from '../src/services/cacheService';
import { logger } from '../src/utils/logger';

async function clearBalanceCache() {
  try {
    console.log('🧹 Clearing all balance caches...');
    
    // Clear all caches
    await cacheService.clearAllCaches();
    
    console.log('✅ All caches cleared successfully!');
    
    // Get cache stats
    const stats = await cacheService.getCacheStats();
    console.log('\n📊 Cache Stats:');
    console.log(`  Balance Cache Count: ${stats.balanceCacheCount}`);
    console.log(`  Token ID Cache Count: ${stats.tokenIdCacheCount}`);
    console.log(`  Gas Analysis Cache Count: ${stats.gasAnalysisCacheCount}`);
    console.log(`  In-Flight Requests: ${stats.inFlightRequests}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to clear cache:', error);
    process.exit(1);
  }
}

// Run the script
clearBalanceCache();