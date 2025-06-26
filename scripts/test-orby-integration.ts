import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../.env.e2e') });

async function testOrbyIntegration() {
  console.log('🔍 Testing Orby Integration with Real API\n');
  
  console.log('Environment Configuration:');
  console.log('  ORBY_INSTANCE_PRIVATE_API_KEY:', process.env.ORBY_INSTANCE_PRIVATE_API_KEY);
  console.log('  ORBY_INSTANCE_PUBLIC_API_KEY:', process.env.ORBY_INSTANCE_PUBLIC_API_KEY);
  console.log('  ORBY_APP_NAME:', process.env.ORBY_APP_NAME);
  console.log('  ORBY_PRIVATE_INSTANCE_URL:', process.env.ORBY_PRIVATE_INSTANCE_URL);
  console.log('');

  // Test direct Orby API
  console.log('1️⃣ Testing Direct Orby API Access:');
  try {
    const orbyClient = axios.create({
      baseURL: process.env.ORBY_PRIVATE_INSTANCE_URL,
      headers: {
        'Authorization': `Bearer ${process.env.ORBY_INSTANCE_PRIVATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Test health/status endpoint
    console.log('\n📍 Testing Orby status endpoint...');
    try {
      const statusResponse = await orbyClient.get('/status');
      console.log('✅ Status Response:', statusResponse.status);
      console.log('   Data:', JSON.stringify(statusResponse.data, null, 2));
    } catch (error: any) {
      console.log('❌ Status request failed:', error.response?.status || error.message);
      if (error.response?.data) {
        console.log('   Error:', JSON.stringify(error.response.data, null, 2));
      }
    }

    // Test chains endpoint
    console.log('\n📍 Testing Orby chains endpoint...');
    try {
      const chainsResponse = await orbyClient.get('/chains');
      console.log('✅ Chains Response:', chainsResponse.status);
      console.log('   Data:', JSON.stringify(chainsResponse.data, null, 2));
    } catch (error: any) {
      console.log('❌ Chains request failed:', error.response?.status || error.message);
      if (error.response?.data) {
        console.log('   Error:', JSON.stringify(error.response.data, null, 2));
      }
    }

    // Test account cluster creation
    console.log('\n📍 Testing account cluster creation...');
    try {
      const clusterData = {
        name: `test-cluster-${Date.now()}`,
        walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f62794'
      };
      
      const clusterResponse = await orbyClient.post('/account-clusters', clusterData);
      console.log('✅ Cluster Response:', clusterResponse.status);
      console.log('   Data:', JSON.stringify(clusterResponse.data, null, 2));
    } catch (error: any) {
      console.log('❌ Cluster creation failed:', error.response?.status || error.message);
      if (error.response?.data) {
        console.log('   Error:', JSON.stringify(error.response.data, null, 2));
      }
    }

  } catch (error: any) {
    console.error('❌ Failed to create Orby client:', error.message);
  }

  // Test backend Orby endpoints
  console.log('\n\n2️⃣ Testing Backend Orby Endpoints:');
  
  const backendUrl = 'http://localhost:3001';
  const api = axios.create({
    baseURL: backendUrl,
    headers: {
      'Authorization': 'Bearer test-token-123'
    },
    validateStatus: () => true
  });

  console.log('\n📍 Testing backend health...');
  const healthResponse = await api.get('/health');
  console.log('✅ Backend Health:', healthResponse.status);
  console.log('   Data:', JSON.stringify(healthResponse.data, null, 2));

  console.log('\n📍 Testing backend Orby chains...');
  const chainsResponse = await api.get('/api/v2/orby/chains');
  console.log('Response Status:', chainsResponse.status);
  console.log('Response Data:', JSON.stringify(chainsResponse.data, null, 2));

  console.log('\n📍 Testing backend Orby health...');
  const orbyHealthResponse = await api.get('/api/v2/orby/health');
  console.log('Response Status:', orbyHealthResponse.status);
  console.log('Response Data:', JSON.stringify(orbyHealthResponse.data, null, 2));
}

// Run the test
testOrbyIntegration().catch(console.error);