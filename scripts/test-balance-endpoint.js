#!/usr/bin/env node

/**
 * Script to test the balance endpoint with proper authentication
 * This verifies both the incorrect and correct endpoint paths
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api/v2';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword';

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

async function testBalanceEndpoint() {
  try {
    log('\n=== Balance Endpoint Test Script ===\n', 'cyan');
    
    // Step 1: Authenticate
    log('1. Authenticating...', 'yellow');
    const authResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    if (!authResponse.data.success) {
      throw new Error('Authentication failed');
    }
    
    const { sessionToken, account } = authResponse.data.data;
    log(`✓ Authentication successful. Account ID: ${account.id}`, 'green');
    
    // Create headers with auth token
    const headers = {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    };
    
    // Step 2: Get profiles
    log('\n2. Fetching profiles...', 'yellow');
    const profilesResponse = await axios.get(`${API_BASE_URL}/profiles`, { headers });
    
    if (!profilesResponse.data.success || !profilesResponse.data.data.length) {
      throw new Error('No profiles found');
    }
    
    const profile = profilesResponse.data.data[0];
    log(`✓ Found profile: ${profile.name} (ID: ${profile.id})`, 'green');
    log(`  Session Wallet: ${profile.sessionWalletAddress}`, 'blue');
    log(`  Orby Cluster ID: ${profile.orbyAccountClusterId || 'Not set'}`, 'blue');
    
    // Step 3: Test incorrect endpoint (what iOS is currently using)
    log('\n3. Testing incorrect endpoint (current iOS implementation)...', 'yellow');
    log(`   GET ${API_BASE_URL}/profiles/${profile.id}/balance`, 'blue');
    
    try {
      await axios.get(`${API_BASE_URL}/profiles/${profile.id}/balance`, { headers });
      log('✗ Unexpected: Endpoint should return 404', 'red');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('✓ Expected 404 error confirmed', 'green');
        log(`  Error: ${error.response.data.error}`, 'yellow');
      } else {
        throw error;
      }
    }
    
    // Step 4: Test correct endpoint
    log('\n4. Testing correct endpoint...', 'yellow');
    log(`   GET ${API_BASE_URL}/orby/${profile.id}/balance`, 'blue');
    
    try {
      const balanceResponse = await axios.get(`${API_BASE_URL}/orby/${profile.id}/balance`, { headers });
      
      if (balanceResponse.data.success) {
        log('✓ Balance endpoint successful!', 'green');
        const balance = balanceResponse.data.data;
        log('\n  Balance Response:', 'cyan');
        log(`  - Total Balance USD: $${balance.totalBalanceUSD || 0}`, 'blue');
        log(`  - Chain Portfolios: ${balance.chainPortfolios ? balance.chainPortfolios.length : 0}`, 'blue');
        
        if (balance.chainPortfolios && balance.chainPortfolios.length > 0) {
          balance.chainPortfolios.forEach(portfolio => {
            log(`    • ${portfolio.chain}: $${portfolio.totalBalanceUSD || 0}`, 'blue');
          });
        }
      } else {
        log('✗ Balance endpoint returned unsuccessful response', 'red');
      }
    } catch (error) {
      log('✗ Error calling balance endpoint:', 'red');
      if (error.response) {
        log(`  Status: ${error.response.status}`, 'red');
        log(`  Error: ${JSON.stringify(error.response.data)}`, 'red');
      } else {
        log(`  ${error.message}`, 'red');
      }
    }
    
    // Step 5: Summary
    log('\n=== Summary ===', 'cyan');
    log('• iOS app is using: /api/v2/profiles/{id}/balance (404 Not Found)', 'yellow');
    log('• Correct endpoint: /api/v2/orby/{id}/balance', 'green');
    log('• Fix required: Update WalletAPI.swift line 16 in iOS app', 'green');
    
  } catch (error) {
    log('\n✗ Test failed:', 'red');
    if (error.response) {
      log(`  Status: ${error.response.status}`, 'red');
      log(`  Error: ${JSON.stringify(error.response.data)}`, 'red');
    } else {
      log(`  ${error.message}`, 'red');
    }
    process.exit(1);
  }
}

// Run the test
testBalanceEndpoint().then(() => {
  log('\n✓ Test completed successfully\n', 'green');
}).catch(() => {
  log('\n✗ Test failed\n', 'red');
  process.exit(1);
});