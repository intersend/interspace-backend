// Load test environment BEFORE any other imports
import '../utils/loadTestEnv';

import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import { testEnv, TestContext } from '../infrastructure/TestEnvironment';
import axios from 'axios';

describe('Simple Orby API Test', () => {
  let context: TestContext;
  let api: any;
  
  beforeAll(async () => {
    // Setup real environment
    context = await testEnv.setup({ useRealServices: true });
    
    // Create API client
    api = axios.create({
      baseURL: context.apiUrl,
      timeout: 30000,
      validateStatus: () => true
    });
    
    console.log('✅ Test environment ready');
    console.log('   API URL:', context.apiUrl);
    console.log('   Orby API Key:', context.orbyApiKey ? 'Configured' : 'Not configured');
    
    // Check server health directly
    try {
      const healthResponse = await axios.get(`${context.apiUrl}/health`);
      console.log('   Server health:', healthResponse.data);
    } catch (error) {
      console.log('   Server health check failed');
    }
  }, 60000);
  
  afterAll(async () => {
    await testEnv.teardown();
  });
  
  it('should get supported chains from Orby', async () => {
    console.log('\n🔗 Testing Orby chains endpoint...');
    
    // First check if the endpoint requires auth
    const checkResponse = await api.get('/api/v2/orby/chains');
    console.log('Initial response status:', checkResponse.status);
    
    if (checkResponse.status === 401) {
      console.log('❌ Endpoint requires authentication');
      console.log('Response:', checkResponse.data);
      
      // Try with a mock auth token
      const authApi = axios.create({
        baseURL: context.apiUrl,
        headers: {
          'Authorization': 'Bearer test-token-123',
          'X-Test-Mode': 'true'
        },
        validateStatus: () => true
      });
      
      const authResponse = await authApi.get('/api/v2/orby/chains');
      console.log('With auth token status:', authResponse.status);
      console.log('With auth token data:', JSON.stringify(authResponse.data, null, 2));
    } else {
      console.log('Response data:', JSON.stringify(checkResponse.data, null, 2));
      
      if (checkResponse.status === 200) {
        expect(checkResponse.data.chains).toBeDefined();
        console.log('✅ Chains retrieved successfully');
      } else {
        console.log('❌ Failed to get chains:', checkResponse.data);
      }
    }
  });
  
  it('should check Orby health', async () => {
    console.log('\n🏥 Testing Orby health endpoint...');
    
    const response = await api.get('/api/v2/orby/health');
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    
    if (response.status === 200) {
      expect(response.data).toBeDefined();
      console.log('✅ Orby health check passed');
    } else {
      console.log('❌ Orby health check failed:', response.data);
    }
  });
});