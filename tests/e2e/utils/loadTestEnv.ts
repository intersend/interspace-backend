import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Load test environment configuration before any other imports
 * This ensures environment variables are available when modules are initialized
 */
export function loadTestEnvironment(): void {
  // Check if MPC should be disabled (for testing without duo node)
  if (process.env.DISABLE_MPC === 'true') {
    console.log('⏭️  MPC disabled for testing');
  }
  
  // Check if we're in real mode
  const isRealMode = process.env.E2E_REAL_MODE === 'true' || process.env.USE_REAL_SERVICES === 'true';
  
  // Always use .env.e2e as it has the real configuration now
  const envPath = path.resolve(__dirname, '../../../.env.e2e');
  console.log(`📋 Loading E2E configuration from ${envPath}`);
  
  const result = dotenv.config({ path: envPath, override: true });
  if (result.error) {
    console.error('❌ Failed to load .env.e2e:', result.error);
    throw new Error('Failed to load test environment configuration');
  } else {
    console.log('✅ E2E configuration loaded');
    // Verify critical environment variables
    if (!process.env.ENCRYPTION_SECRET) {
      throw new Error('ENCRYPTION_SECRET not found in environment');
    }
    console.log('✅ ENCRYPTION_SECRET loaded (length:', process.env.ENCRYPTION_SECRET.length, ')');
  }
}

// Load environment immediately when this module is imported
loadTestEnvironment();