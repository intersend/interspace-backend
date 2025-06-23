const axios = require('axios');

const baseURL = 'http://127.0.0.1:3000';
const api = axios.create({ baseURL, validateStatus: () => true });

async function testSiweNonce() {
  console.log('Testing SIWE nonce endpoints...\n');
  
  // Test V1 nonce endpoint
  console.log('1. Testing /api/v1/siwe/nonce');
  try {
    const v1Response = await api.get('/api/v1/siwe/nonce');
    console.log(`   Status: ${v1Response.status}`);
    console.log(`   Response:`, v1Response.data);
    
    if (v1Response.status === 200 && v1Response.data.data?.nonce) {
      console.log('   ✅ V1 nonce endpoint working correctly!');
    } else {
      console.log('   ❌ V1 nonce endpoint failed');
    }
  } catch (error) {
    console.log('   ❌ V1 nonce endpoint error:', error.message);
  }
  
  console.log('\n2. Testing /api/v2/siwe/nonce');
  try {
    const v2Response = await api.get('/api/v2/siwe/nonce');
    console.log(`   Status: ${v2Response.status}`);
    console.log(`   Response:`, v2Response.data);
    
    if (v2Response.status === 200 && v2Response.data.data?.nonce) {
      console.log('   ✅ V2 nonce endpoint working correctly!');
    } else {
      console.log('   ❌ V2 nonce endpoint failed');
    }
  } catch (error) {
    console.log('   ❌ V2 nonce endpoint error:', error.message);
  }
}

testSiweNonce().catch(console.error);