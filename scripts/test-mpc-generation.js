#!/usr/bin/env node
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testMPCGeneration() {
  console.log('🧪 Testing MPC Generation Flow');
  console.log('==============================\n');

  try {
    // 1. First create a test user or get auth token
    console.log('1. Testing without auth token...');
    try {
      const response = await axios.post(`${API_URL}/api/v2/mpc/generate`, {
        profileId: 'test-profile-' + Date.now()
      });
      console.log('   ✅ Response:', response.data);
    } catch (error) {
      console.log('   ❌ Error (expected):', error.response?.data?.error || error.message);
      console.log('   Status:', error.response?.status);
    }

    // 2. Test health endpoint
    console.log('\n2. Testing backend health...');
    try {
      const health = await axios.get(`${API_URL}/health`);
      console.log('   ✅ Backend is healthy:', health.data);
    } catch (error) {
      console.log('   ❌ Backend health check failed:', error.message);
    }

    // 3. Check if backend can reach duo-node
    console.log('\n3. Checking duo-node configuration...');
    console.log('   DUO_NODE_URL:', process.env.DUO_NODE_URL || 'Not set in environment');
    console.log('   Current .env should have:');
    console.log('   DUO_NODE_URL=https://interspace-duo-node-dev-784862970473.us-central1.run.app');

    // 4. Test MPC status endpoint
    console.log('\n4. Testing MPC status endpoint...');
    try {
      const response = await axios.get(`${API_URL}/api/v2/mpc/status/test-profile`);
      console.log('   Response:', response.data);
    } catch (error) {
      console.log('   Status:', error.response?.status);
      console.log('   Error:', error.response?.data || error.message);
    }

    console.log('\n📝 Next Steps:');
    console.log('1. Ensure backend is running with updated .env');
    console.log('2. Backend needs proper Google Cloud credentials to call duo-node');
    console.log('3. Create a user profile through the iOS app');
    console.log('4. Check backend logs for MPC generation attempts');

  } catch (error) {
    console.error('Unexpected error:', error.message);
  }
}

testMPCGeneration();