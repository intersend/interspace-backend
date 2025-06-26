#!/usr/bin/env ts-node

import { config } from '../src/utils/config';
import { orbyService } from '../src/services/orbyService';

async function testOrbyConnection() {
  console.log('🔍 Testing Orby Service Connection...\n');
  
  console.log('Configuration:');
  console.log(`- Private Instance URL: ${config.ORBY_PRIVATE_INSTANCE_URL}`);
  console.log(`- App Name: ${config.ORBY_APP_NAME}`);
  console.log(`- Private API Key: ${config.ORBY_INSTANCE_PRIVATE_API_KEY.substring(0, 10)}...`);
  console.log(`- Public API Key: ${config.ORBY_INSTANCE_PUBLIC_API_KEY.substring(0, 10)}...`);
  console.log('\n');
  
  try {
    console.log('🏥 Running health check...');
    const healthStatus = await orbyService.checkHealth();
    
    console.log('\nHealth Check Results:');
    console.log(`- Status: ${healthStatus.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log(`- Connection: ${healthStatus.connectionStatus}`);
    console.log(`- Timestamp: ${healthStatus.timestamp}`);
    
    if (healthStatus.errorMessage) {
      console.log(`- Error: ${healthStatus.errorMessage}`);
    }
    
    if (healthStatus.isHealthy) {
      console.log('\n✅ Orby service is healthy and ready to use!');
    } else {
      console.log('\n❌ Orby service is not healthy. Please check:');
      console.log('1. API credentials are correct');
      console.log('2. Private instance URL is accessible');
      console.log('3. Network connectivity to Orby servers');
    }
  } catch (error) {
    console.error('\n❌ Failed to test Orby connection:', error);
  }
}

// Run the test
testOrbyConnection().catch(console.error);