#!/usr/bin/env node

/**
 * Test script for MPC webhook endpoints
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.MPC_WEBHOOK_SECRET || 'development-webhook-secret';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testMpcWebhook() {
  try {
    log('\n=== MPC Webhook Test ===\n', 'cyan');
    
    // First, create a test profile to use
    log('1. Creating test account and profile...', 'yellow');
    
    // Create account
    const email = `test${Date.now()}@example.com`;
    await axios.post(`${API_BASE_URL}/api/v2/auth/send-email-code`, { email });
    
    const codeResponse = await axios.get(`${API_BASE_URL}/api/v2/auth/dev/last-email-code`, {
      params: { email }
    });
    const code = codeResponse.data.code;
    
    const authResponse = await axios.post(`${API_BASE_URL}/api/v2/auth/authenticate`, {
      strategy: 'email',
      email,
      verificationCode: code
    });
    
    const { tokens } = authResponse.data;
    const headers = {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json'
    };
    
    // Create profile
    const profileResponse = await axios.post(`${API_BASE_URL}/api/v2/profiles`, {
      name: 'Test Profile for Webhook'
    }, { headers });
    
    const profile = profileResponse.data.data;
    log(`✓ Profile created: ${profile.id}`, 'green');
    log(`  Placeholder wallet: ${profile.sessionWalletAddress}`, 'blue');
    
    // Step 2: Test webhook endpoint
    log('\n2. Testing MPC key generation webhook...', 'yellow');
    
    const webhookPayload = {
      profileId: profile.id,
      keyId: `test-key-${Date.now()}`,
      publicKey: '0x04' + '1'.repeat(128), // Mock public key
      address: '0x' + '2'.repeat(40) // Mock address
    };
    
    try {
      const webhookResponse = await axios.post(
        `${API_BASE_URL}/api/webhooks/mpc/key-generated`,
        webhookPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': WEBHOOK_SECRET
          }
        }
      );
      
      if (webhookResponse.data.success) {
        log('✓ Webhook accepted successfully', 'green');
        log(`  Response: ${webhookResponse.data.message}`, 'blue');
      } else {
        log('✗ Webhook failed', 'red');
        log(`  Response: ${JSON.stringify(webhookResponse.data)}`, 'red');
      }
    } catch (error) {
      if (error.response) {
        log('✗ Webhook request failed', 'red');
        log(`  Status: ${error.response.status}`, 'red');
        log(`  Error: ${JSON.stringify(error.response.data)}`, 'red');
      } else {
        throw error;
      }
    }
    
    // Step 3: Verify profile was updated
    log('\n3. Verifying profile update...', 'yellow');
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a moment
    
    const updatedProfilesResponse = await axios.get(`${API_BASE_URL}/api/v2/profiles`, { headers });
    const updatedProfile = updatedProfilesResponse.data.data.find(p => p.id === profile.id);
    
    if (updatedProfile) {
      log('✓ Profile retrieved', 'green');
      log(`  Original wallet: ${profile.sessionWalletAddress}`, 'blue');
      log(`  Updated wallet: ${updatedProfile.sessionWalletAddress}`, 'blue');
      log(`  Wallet updated: ${updatedProfile.sessionWalletAddress !== profile.sessionWalletAddress ? 'YES' : 'NO'}`, 
          updatedProfile.sessionWalletAddress !== profile.sessionWalletAddress ? 'green' : 'yellow');
      log(`  Orby Cluster ID: ${updatedProfile.orbyAccountClusterId || 'Not set'}`, 'blue');
    }
    
    // Step 4: Test webhook authentication
    log('\n4. Testing webhook authentication...', 'yellow');
    
    try {
      // Test with wrong secret
      await axios.post(
        `${API_BASE_URL}/api/webhooks/mpc/key-generated`,
        webhookPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': 'wrong-secret'
          }
        }
      );
      log('✗ Webhook should have been rejected with wrong secret', 'red');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        log('✓ Webhook correctly rejected unauthorized request', 'green');
      } else {
        log('✗ Unexpected error', 'red');
        throw error;
      }
    }
    
    // Step 5: Test key share update webhook
    log('\n5. Testing key share update webhook...', 'yellow');
    
    const updatePayload = {
      profileId: profile.id,
      keyId: webhookPayload.keyId,
      operation: 'backup'
    };
    
    try {
      const updateResponse = await axios.post(
        `${API_BASE_URL}/api/webhooks/mpc/key-share-update`,
        updatePayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': WEBHOOK_SECRET
          }
        }
      );
      
      if (updateResponse.data.success) {
        log('✓ Key share update webhook accepted', 'green');
      }
    } catch (error) {
      log('✗ Key share update webhook failed', 'red');
      if (error.response) {
        log(`  Error: ${JSON.stringify(error.response.data)}`, 'red');
      }
    }
    
    log('\n=== Webhook Test Complete ===\n', 'cyan');
    
  } catch (error) {
    log('\n✗ Test failed:', 'red');
    console.error(error);
  }
}

// Run the test
testMpcWebhook();