#!/usr/bin/env node

/**
 * Simple test script to verify MPC endpoints are working
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

// Test configuration
const testProfileId = 'test-profile-' + Date.now();

// Simple auth token for testing (you'll need to replace with a real one)
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'test-token';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 5000
});

async function testHealthCheck() {
  console.log('1. Testing health check...');
  try {
    const response = await api.get('/health');
    console.log('✅ Health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testGetCloudPublicKey() {
  console.log('\n2. Testing cloud public key endpoint...');
  try {
    const response = await api.post('/api/v2/mpc/generate', {
      profileId: testProfileId
    });
    console.log('✅ Cloud public key received:', {
      success: response.data.success,
      hasCloudPublicKey: !!response.data.data?.cloudPublicKey
    });
    return response.data.data;
  } catch (error) {
    console.error('❌ Cloud public key failed:', error.response?.data || error.message);
    return null;
  }
}

async function testStartKeyGeneration() {
  console.log('\n3. Testing key generation start...');
  try {
    // Mock P1 messages for testing
    const mockP1Messages = [{
      type: 'keyGen',
      round: 1,
      sessionId: 'test-session-' + Date.now(),
      data: {
        test: 'mock-p1-data'
      }
    }];

    const response = await api.post('/api/v2/mpc/keygen/start', {
      profileId: testProfileId,
      p1Messages: mockP1Messages
    });
    
    console.log('✅ Key generation response:', {
      success: response.data.success,
      hasSessionId: !!response.data.data?.sessionId,
      profileId: response.data.data?.profileId
    });
    return response.data.data;
  } catch (error) {
    console.error('❌ Key generation failed:', error.response?.data || error.message);
    return null;
  }
}

async function testSessionStatus(sessionId) {
  console.log('\n4. Testing session status...');
  if (!sessionId) {
    console.log('⚠️  No session ID to test');
    return;
  }

  try {
    const response = await api.get(`/api/v2/mpc/session/${sessionId}`);
    console.log('✅ Session status:', response.data.data);
  } catch (error) {
    console.error('❌ Session status failed:', error.response?.data || error.message);
  }
}

async function testDuoNodeConnection() {
  console.log('\n5. Testing duo-node WebSocket connection...');
  try {
    // This tests if the backend can reach duo-node
    const response = await api.get('/api/v2/mpc/status/' + testProfileId);
    console.log('✅ MPC status check:', response.data);
  } catch (error) {
    console.error('❌ MPC status check failed:', error.response?.data || error.message);
  }
}

async function runTests() {
  console.log('🧪 MPC Local Testing');
  console.log('====================');
  console.log(`API URL: ${API_BASE_URL}`);
  console.log(`Profile ID: ${testProfileId}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? 'Set' : 'Not set'}`);
  
  // Run tests
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.error('\n❌ Backend is not running. Please start it with:');
    console.error('docker-compose -f docker-compose.local.yml --profile local up');
    process.exit(1);
  }

  const cloudKeyData = await testGetCloudPublicKey();
  const keyGenData = await testStartKeyGeneration();
  
  if (keyGenData?.sessionId) {
    await testSessionStatus(keyGenData.sessionId);
  }
  
  await testDuoNodeConnection();
  
  console.log('\n✅ Testing complete!');
  
  // Check if duo-node is connected
  console.log('\n📋 Next steps:');
  console.log('1. Check duo-node logs: docker-compose -f docker-compose.local.yml logs duo-node');
  console.log('2. Verify WebSocket connection is established');
  console.log('3. Test with real P1 messages from iOS app');
}

// Run the tests
runTests().catch(console.error);