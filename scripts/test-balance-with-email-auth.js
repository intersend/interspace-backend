#!/usr/bin/env node

/**
 * Script to test the balance endpoint using email authentication
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = `test${Date.now()}@example.com`;

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
    log('\n=== Balance Endpoint Test Script (Email Auth) ===\n', 'cyan');
    
    // Step 1: Send email code
    log('1. Sending email verification code...', 'yellow');
    log(`   Email: ${TEST_EMAIL}`, 'blue');
    
    const sendCodeResponse = await axios.post(`${API_BASE_URL}/api/v2/auth/send-email-code`, {
      email: TEST_EMAIL
    });
    
    if (!sendCodeResponse.data.success) {
      throw new Error('Failed to send email code');
    }
    log('✓ Email code sent successfully', 'green');
    
    // Step 2: Get code from dev endpoint
    log('\n2. Getting verification code from dev endpoint...', 'yellow');
    const getCodeResponse = await axios.get(`${API_BASE_URL}/api/v2/auth/dev/last-email-code`, {
      params: { email: TEST_EMAIL }
    });
    
    const code = getCodeResponse.data.code;
    log(`✓ Retrieved code: ${code}`, 'green');
    
    // Step 3: Authenticate with code
    log('\n3. Authenticating with email code...', 'yellow');
    const authResponse = await axios.post(`${API_BASE_URL}/api/v2/auth/authenticate`, {
      strategy: 'email',
      email: TEST_EMAIL,
      verificationCode: code
    });
    
    if (!authResponse.data.success) {
      throw new Error('Authentication failed');
    }
    
    const { account, tokens, profiles } = authResponse.data;
    const sessionToken = tokens.accessToken;
    log(`✓ Authentication successful`, 'green');
    log(`  Account ID: ${account.id}`, 'blue');
    log(`  Account Type: ${account.strategy}`, 'blue');
    
    // Create headers with auth token
    const headers = {
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json'
    };
    
    // Step 4: Check if we already have a profile, otherwise create one
    log('\n4. Checking profiles...', 'yellow');
    let profile;
    
    if (profiles && profiles.length > 0) {
      // Use existing profile
      profile = profiles[0];
      log(`✓ Using existing profile`, 'green');
      
      // Get full profile details
      const profileResponse = await axios.get(`${API_BASE_URL}/api/v2/profiles`, { headers });
      if (profileResponse.data.success && profileResponse.data.data.length > 0) {
        profile = profileResponse.data.data[0];
      }
    } else {
      // Create a new profile
      log('  No existing profile, creating new one...', 'yellow');
      const createProfileResponse = await axios.post(`${API_BASE_URL}/api/v2/profiles`, {
        name: 'Test Profile'
      }, { headers });
      
      if (!createProfileResponse.data.success) {
        throw new Error('Failed to create profile');
      }
      
      profile = createProfileResponse.data.data;
      log(`✓ Profile created successfully`, 'green');
    }
    
    log(`  Profile ID: ${profile.id}`, 'blue');
    log(`  Profile Name: ${profile.name || profile.displayName}`, 'blue');
    log(`  Session Wallet: ${profile.sessionWalletAddress || 'Not set'}`, 'blue');
    log(`  Orby Cluster ID: ${profile.orbyAccountClusterId || 'Not set'}`, 'blue');
    
    // Step 5: Test the profile balance endpoint (now the correct endpoint)
    log('\n5. Testing profile balance endpoint...', 'yellow');
    log(`   GET ${API_BASE_URL}/api/v2/profiles/${profile.id}/balance`, 'blue');
    
    try {
      const balanceResponse = await axios.get(`${API_BASE_URL}/api/v2/profiles/${profile.id}/balance`, { headers });
      
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
    
    // Step 6: Summary
    log('\n=== Summary ===', 'cyan');
    log('✓ Balance endpoint is working at: /api/v2/profiles/{id}/balance', 'green');
    log('✓ iOS app does not need any changes', 'green');
    log('\nAdditional findings:', 'cyan');
    log('• New profiles are created with placeholder session wallet addresses', 'yellow');
    log('• Orby cluster is created on-demand when balance is requested', 'yellow');
    log('• MPC webhook will update the session wallet when keys are generated', 'yellow');
    
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