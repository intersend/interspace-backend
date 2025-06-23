#!/usr/bin/env node

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api/v2';
const TEST_EMAIL = 'test@example.com';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testV2Authentication() {
  console.log('Testing V2 Authentication Flow\n');
  
  try {
    // Test 1: Send email code
    console.log('1. Testing send email code...');
    const sendCodeResponse = await axios.post(`${API_BASE}/auth/send-email-code`, {
      email: TEST_EMAIL
    });
    console.log('✅ Send email code:', sendCodeResponse.data);
    
    // Test 2: Get SIWE nonce
    console.log('\n2. Testing SIWE nonce...');
    const nonceResponse = await axios.get(`${API_BASE}/siwe/nonce`);
    console.log('✅ SIWE nonce:', nonceResponse.data);
    
    // Test 3: Test verify endpoint (will fail without valid code)
    console.log('\n3. Testing verify endpoint with invalid code...');
    try {
      await axios.post(`${API_BASE}/auth/verify-email-code`, {
        email: TEST_EMAIL,
        code: '123456'
      });
    } catch (error) {
      console.log('✅ Expected error for invalid code:', error.response.data);
    }
    
    // Test 4: Get development code (only in dev mode)
    if (process.env.NODE_ENV === 'development') {
      console.log('\n4. Testing dev endpoint...');
      try {
        const devCodeResponse = await axios.get(`${API_BASE}/auth/dev/last-email-code?email=${TEST_EMAIL}`);
        console.log('✅ Dev code endpoint:', devCodeResponse.data);
      } catch (error) {
        console.log('⚠️  Dev code endpoint error:', error.response?.data || error.message);
      }
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run tests
testV2Authentication();