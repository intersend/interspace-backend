#!/usr/bin/env ts-node

import axios from 'axios';
import { config } from '../src/utils/config';

// Test configuration
const API_BASE_URL = `http://localhost:${config.PORT}/api/v1`;
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'testpassword123';

// Test data
let authToken = '';
let userId = '';
let profileId = '';

// Helper function to make API requests
async function apiRequest(method: string, endpoint: string, data?: any, token?: string) {
  try {
    const response = await axios({
      method,
      url: `${API_BASE_URL}${endpoint}`,
      data,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      console.error(`❌ API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      throw error;
    }
    throw error;
  }
}

async function testOrbyEndpoints() {
  console.log('🧪 Testing Orby API Endpoints\n');
  
  try {
    // Step 1: Authenticate
    console.log('1️⃣ Authenticating test user...');
    const authResponse = await apiRequest('POST', '/auth/login', {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD
    });
    
    authToken = authResponse.data.accessToken;
    userId = authResponse.data.user.id;
    console.log('✅ Authentication successful\n');
    
    // Step 2: Create a profile (this will trigger Orby cluster creation)
    console.log('2️⃣ Creating SmartProfile with Orby cluster...');
    const profileResponse = await apiRequest('POST', '/profiles', {
      name: `Orby Test Profile ${Date.now()}`
    }, authToken);
    
    profileId = profileResponse.data.id;
    console.log(`✅ Profile created: ${profileId}`);
    console.log(`   Session Wallet: ${profileResponse.data.sessionWalletAddress}`);
    console.log(`   Orby Cluster ID: ${profileResponse.data.orbyAccountClusterId || 'Not created yet'}\n`);
    
    // Wait a bit for Orby cluster to be fully created
    console.log('⏳ Waiting for Orby cluster creation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 3: Test health check endpoint
    console.log('3️⃣ Testing Orby health check...');
    const healthResponse = await apiRequest('GET', '/orby/health');
    console.log(`✅ Health check: ${healthResponse.data.status}`);
    console.log(`   Connection: ${healthResponse.data.details.connectionStatus}\n`);
    
    // Step 4: Get unified balance
    console.log('4️⃣ Getting unified balance...');
    try {
      const balanceResponse = await apiRequest('GET', `/orby/profiles/${profileId}/balance`, null, authToken);
      console.log('✅ Balance retrieved successfully');
      console.log(`   Total tokens: ${balanceResponse.data.unifiedBalance.tokens.length}`);
      console.log(`   Linked accounts: ${balanceResponse.data.linkedAccountsCount}\n`);
    } catch (error) {
      console.log('⚠️  Balance endpoint returned error (expected if no tokens)\n');
    }
    
    // Step 5: Get available gas tokens
    console.log('5️⃣ Getting available gas tokens...');
    try {
      const gasTokensResponse = await apiRequest('GET', `/orby/profiles/${profileId}/gas-tokens`, null, authToken);
      console.log('✅ Gas tokens retrieved');
      console.log(`   Available tokens: ${gasTokensResponse.data.availableTokens.length}`);
      console.log(`   Suggested token: ${gasTokensResponse.data.suggestedToken?.symbol || 'None'}\n`);
    } catch (error) {
      console.log('⚠️  Gas tokens endpoint returned error (expected if no tokens)\n');
    }
    
    // Step 6: Get virtual node RPC URL
    console.log('6️⃣ Getting virtual node RPC URL...');
    const rpcResponse = await apiRequest('GET', `/orby/profiles/${profileId}/orby-rpc-url?chainId=1`, null, authToken);
    console.log('✅ RPC URL retrieved');
    console.log(`   URL: ${rpcResponse.data.rpcUrl}\n`);
    
    // Step 7: Create a test intent (will fail without tokens, but tests the endpoint)
    console.log('7️⃣ Creating test intent...');
    try {
      const intentResponse = await apiRequest('POST', `/orby/profiles/${profileId}/intent`, {
        type: 'transfer',
        from: {
          token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
          chainId: 1,
          amount: '1000000' // 1 USDC
        },
        to: {
          address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA5e'
        }
      }, authToken);
      console.log('✅ Intent created successfully');
      console.log(`   Intent ID: ${intentResponse.data.intentId}`);
      console.log(`   Operation Set ID: ${intentResponse.data.operationSetId}\n`);
    } catch (error) {
      console.log('⚠️  Intent creation failed (expected without tokens)\n');
    }
    
    // Step 8: Get transaction history
    console.log('8️⃣ Getting transaction history...');
    const historyResponse = await apiRequest('GET', `/orby/profiles/${profileId}/transactions`, null, authToken);
    console.log('✅ Transaction history retrieved');
    console.log(`   Total transactions: ${historyResponse.data.pagination.total}`);
    console.log(`   Current page: ${historyResponse.data.pagination.page}\n`);
    
    // Clean up - delete the test profile
    console.log('🧹 Cleaning up test profile...');
    await apiRequest('DELETE', `/profiles/${profileId}`, null, authToken);
    console.log('✅ Test profile deleted\n');
    
    console.log('🎉 All Orby endpoint tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the tests
console.log('Note: Make sure the backend server is running and you have a test user created.\n');
testOrbyEndpoints().catch(console.error);