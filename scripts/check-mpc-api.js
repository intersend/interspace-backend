#!/usr/bin/env node

/**
 * Script to check MPC key status via API endpoints
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// You'll need to provide a valid auth token
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ Please provide an AUTH_TOKEN environment variable');
  console.error('   Example: AUTH_TOKEN=your-token-here node scripts/check-mpc-api.js');
  process.exit(1);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

async function checkProfileMPCStatus(profileId) {
  console.log(`\n🔍 Checking MPC status for profile: ${profileId}`);
  
  try {
    // Check V2 endpoint
    const v2Response = await api.get(`/api/v2/mpc/status/${profileId}`);
    console.log('✅ V2 MPC Status:', JSON.stringify(v2Response.data, null, 2));
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('❌ V2 endpoint: Profile not found or no access');
    } else {
      console.error('❌ V2 endpoint error:', error.response?.data || error.message);
    }
  }

  try {
    // Check V1 endpoint
    const v1Response = await api.get(`/api/v1/mpc/status/${profileId}`);
    console.log('✅ V1 MPC Status:', JSON.stringify(v1Response.data, null, 2));
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('❌ V1 endpoint: Profile not found or no access');
    } else {
      console.error('❌ V1 endpoint error:', error.response?.data || error.message);
    }
  }
}

async function getUserProfiles() {
  console.log('📋 Getting user profiles...');
  
  try {
    // Try V2 profile endpoint
    const v2Response = await api.get('/api/v2/profiles');
    console.log('✅ V2 Profiles:', JSON.stringify(v2Response.data, null, 2));
    return v2Response.data.data || [];
  } catch (error) {
    console.error('❌ V2 profiles error:', error.response?.data || error.message);
  }

  try {
    // Try V1 profile endpoint
    const v1Response = await api.get('/api/v1/profiles');
    console.log('✅ V1 Profiles:', JSON.stringify(v1Response.data, null, 2));
    return v1Response.data.data || [];
  } catch (error) {
    console.error('❌ V1 profiles error:', error.response?.data || error.message);
  }

  return [];
}

async function main() {
  console.log('🚀 MPC API Status Check');
  console.log(`   API URL: ${API_BASE_URL}`);
  console.log(`   Auth Token: ${AUTH_TOKEN.substring(0, 10)}...`);

  // First check if the API is healthy
  try {
    const healthResponse = await api.get('/health');
    console.log('✅ API is healthy:', healthResponse.data);
  } catch (error) {
    console.error('❌ API health check failed:', error.message);
    console.error('   Make sure the backend is running on', API_BASE_URL);
    return;
  }

  // Get user profiles
  const profiles = await getUserProfiles();
  
  if (profiles.length === 0) {
    console.log('\n⚠️  No profiles found for this user');
    console.log('   You may need to create profiles first or check your auth token');
    
    // If you know specific profile IDs, you can check them directly
    const knownProfileIds = process.argv.slice(2);
    if (knownProfileIds.length > 0) {
      console.log('\n📝 Checking provided profile IDs...');
      for (const profileId of knownProfileIds) {
        await checkProfileMPCStatus(profileId);
      }
    }
  } else {
    // Check MPC status for each profile
    for (const profile of profiles) {
      await checkProfileMPCStatus(profile.id);
    }
  }
}

// Run the check
main().catch(console.error);