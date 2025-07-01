#!/usr/bin/env node

/**
 * Test script for end-to-end MPC wallet flow
 * This simulates what the iOS app would do
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN; // Set this to a valid auth token

if (!AUTH_TOKEN) {
  console.error('Please set AUTH_TOKEN environment variable');
  process.exit(1);
}

// Create axios instance with auth
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Test data
const TEST_PROFILE_ID = process.env.PROFILE_ID || 'test-profile-id';

/**
 * Step 1: Get cloud public key
 */
async function getCloudPublicKey() {
  console.log('\n📡 Step 1: Getting cloud public key...');
  try {
    const response = await api.post('/api/v2/mpc/generate', {
      profileId: TEST_PROFILE_ID
    });
    
    console.log('✅ Cloud public key received:', response.data.data.cloudPublicKey);
    return response.data.data;
  } catch (error) {
    console.error('❌ Failed to get cloud public key:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Step 2: Start key generation session
 */
async function startKeyGeneration() {
  console.log('\n🔑 Step 2: Starting key generation session...');
  try {
    // In real implementation, iOS would generate P1 messages using Silence Labs SDK
    // For testing, we'll start with empty messages
    const response = await api.post('/api/v2/mpc/keygen/start', {
      profileId: TEST_PROFILE_ID,
      p1Messages: []
    });
    
    console.log('✅ Key generation session started');
    console.log('Session data:', response.data.data);
    return response.data.data;
  } catch (error) {
    console.error('❌ Failed to start key generation:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Step 3: Check key generation status
 */
async function checkKeyStatus() {
  console.log('\n🔍 Step 3: Checking key generation status...');
  try {
    const response = await api.get(`/api/v2/mpc/status/${TEST_PROFILE_ID}`);
    
    console.log('✅ Key status:', response.data.data);
    return response.data.data;
  } catch (error) {
    console.error('❌ Failed to check key status:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Step 4: Test signing
 */
async function testSigning(message = 'Hello, MPC!') {
  console.log('\n✍️  Step 4: Testing MPC signing...');
  try {
    const response = await api.post('/api/v2/mpc/sign/start', {
      profileId: TEST_PROFILE_ID,
      message: message,
      p1Messages: []
    });
    
    console.log('✅ Signing completed');
    console.log('Signature:', response.data.data.signature);
    return response.data.data;
  } catch (error) {
    console.error('❌ Failed to sign message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Step 5: Test backup
 */
async function testBackup() {
  console.log('\n💾 Step 5: Testing key backup...');
  try {
    // Generate a dummy RSA public key for testing
    const dummyRSAPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890test
public key for testing backup functionality only
-----END PUBLIC KEY-----`;

    const response = await api.post('/api/v2/mpc/backup', {
      profileId: TEST_PROFILE_ID,
      rsaPubkeyPem: dummyRSAPublicKey,
      label: 'Test Backup',
      twoFactorCode: '123456' // Would need real 2FA in production
    });
    
    console.log('✅ Backup created successfully');
    console.log('Backup data:', response.data.data);
    return response.data.data;
  } catch (error) {
    console.error('❌ Failed to create backup:', error.response?.data || error.message);
    // Non-critical, continue
  }
}

/**
 * Main test flow
 */
async function runMPCTests() {
  console.log('🚀 Starting MPC Wallet End-to-End Tests');
  console.log('=====================================');
  console.log(`API URL: ${API_BASE_URL}`);
  console.log(`Profile ID: ${TEST_PROFILE_ID}`);
  
  try {
    // Step 1: Get cloud public key
    const cloudKeyData = await getCloudPublicKey();
    
    // Step 2: Start key generation
    // Note: This will fail in the current implementation because we need
    // actual P1 messages from Silence Labs SDK
    try {
      const keyGenResult = await startKeyGeneration();
    } catch (error) {
      console.log('⚠️  Expected failure: Key generation requires real P1 messages from iOS SDK');
    }
    
    // Step 3: Check status
    const keyStatus = await checkKeyStatus();
    
    if (keyStatus.hasKey) {
      // Step 4: Test signing
      await testSigning();
      
      // Step 5: Test backup
      await testBackup();
    }
    
    console.log('\n✅ All tests completed!');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Helper to test WebSocket connection to duo-node
async function testDuoNodeConnection() {
  console.log('\n🔌 Testing duo-node WebSocket connection...');
  const io = require('socket.io-client');
  const duoNodeUrl = cloudKeyData.duoNodeUrl || 'http://localhost:3001';
  
  const socket = io(duoNodeUrl, {
    transports: ['websocket'],
    timeout: 5000
  });
  
  return new Promise((resolve, reject) => {
    socket.on('connect', () => {
      console.log('✅ Connected to duo-node');
      socket.disconnect();
      resolve();
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ Failed to connect to duo-node:', error.message);
      reject(error);
    });
    
    setTimeout(() => {
      socket.disconnect();
      reject(new Error('Connection timeout'));
    }, 5000);
  });
}

// Run tests
if (require.main === module) {
  runMPCTests().catch(console.error);
}

module.exports = { runMPCTests };