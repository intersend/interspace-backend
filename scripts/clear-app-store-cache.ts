import { cacheService } from '../src/services/cacheService';

async function main() {
  console.log('Clearing app store cache...');
  
  try {
    // Clear specific app store cache keys
    await cacheService.delete('app-store:categories');
    await cacheService.delete('app-store:featured');
    await cacheService.deletePattern('app-store:apps:*');
    await cacheService.deletePattern('app-store:app:*');
    
    console.log('✅ App store cache cleared successfully');
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
  
  process.exit(0);
}

main();