#!/usr/bin/env node

/**
 * Detailed test for Orby balance endpoint
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

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

async function testOrbyBalance() {
  try {
    log('\n=== Detailed Orby Balance Test ===\n', 'cyan');
    
    // Step 1: Authenticate with email
    const email = `test${Date.now()}@example.com`;
    log('1. Creating new test account...', 'yellow');
    log(`   Email: ${email}`, 'blue');
    
    // Send code
    await axios.post(`${API_BASE_URL}/api/v2/auth/send-email-code`, { email });
    
    // Get code
    const codeResponse = await axios.get(`${API_BASE_URL}/api/v2/auth/dev/last-email-code`, {
      params: { email }
    });
    const code = codeResponse.data.code;
    log(`   Code: ${code}`, 'blue');
    
    // Authenticate
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
    
    log('✓ Authentication successful', 'green');
    
    // Step 2: Create a new profile
    log('\n2. Creating new profile...', 'yellow');
    
    const createProfileResponse = await axios.post(`${API_BASE_URL}/api/v2/profiles`, {
      name: 'Test Profile for Balance'
    }, { headers });
    
    const profile = createProfileResponse.data.data;
    log('✓ Profile created', 'green');
    log(`   ID: ${profile.id}`, 'blue');
    log(`   Session Wallet: ${profile.sessionWalletAddress}`, 'blue');
    log(`   Orby Cluster ID: ${profile.orbyAccountClusterId || 'Not set'}`, 'blue');
    
    // Step 3: Wait a moment for async Orby cluster creation
    log('\n3. Waiting for Orby cluster creation...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 4: Get updated profile info
    log('\n4. Fetching updated profile...', 'yellow');
    const profilesResponse = await axios.get(`${API_BASE_URL}/api/v2/profiles`, { headers });
    const updatedProfile = profilesResponse.data.data.find(p => p.id === profile.id);
    
    log(`   Orby Cluster ID: ${updatedProfile.orbyAccountClusterId || 'Still not set'}`, 
        updatedProfile.orbyAccountClusterId ? 'green' : 'red');
    
    // Step 5: Test balance endpoint
    log('\n5. Testing balance endpoint...', 'yellow');
    
    try {
      const balanceResponse = await axios.get(
        `${API_BASE_URL}/api/v2/orby/${profile.id}/balance`,
        { 
          headers,
          timeout: 10000 // 10 second timeout
        }
      );
      
      log('✓ Balance endpoint successful!', 'green');
      const balance = balanceResponse.data.data;
      log('\nBalance Response:', 'cyan');
      log(`  Total Balance USD: $${balance.totalBalanceUSD || 0}`, 'blue');
      log(`  Chain Portfolios: ${balance.chainPortfolios ? balance.chainPortfolios.length : 0}`, 'blue');
      
    } catch (error) {
      log('✗ Balance endpoint failed:', 'red');
      if (error.code === 'ECONNRESET' || error.message.includes('socket hang up')) {
        log('  Socket connection error - Orby service might be down or timing out', 'red');
      } else if (error.response) {
        log(`  Status: ${error.response.status}`, 'red');
        log(`  Error: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
      } else {
        log(`  Error: ${error.message}`, 'red');
      }
      
      // Try to get more info
      log('\n6. Checking Orby service configuration...', 'yellow');
      
      try {
        // Check if we can get the RPC URL (another Orby endpoint)
        const rpcResponse = await axios.get(
          `${API_BASE_URL}/api/v2/profiles/${profile.id}/orby-rpc-url?chainId=1`,
          { headers }
        );
        log('✓ Orby RPC endpoint works', 'green');
        log(`  RPC URL: ${rpcResponse.data.data}`, 'blue');
      } catch (rpcError) {
        log('✗ Orby RPC endpoint also failed', 'red');
        log('  This suggests an Orby service configuration issue', 'yellow');
      }
    }
    
    log('\n=== Test Complete ===\n', 'cyan');
    
  } catch (error) {
    log('\n✗ Test failed:', 'red');
    console.error(error);
  }
}

// Run the test
testOrbyBalance();