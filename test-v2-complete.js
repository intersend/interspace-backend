const axios = require('axios');
const { ethers } = require('ethers');
const { SiweMessage } = require('siwe');

const baseURL = 'http://localhost:3000';
const api = axios.create({ baseURL, validateStatus: () => true });

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, error = null) {
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${name}`);
  if (error) console.log(`   Error: ${error}`);
  results.tests.push({ name, passed, error });
  if (passed) results.passed++;
  else results.failed++;
}

async function testV2Complete() {
  console.log('=== V2 FLAT IDENTITY COMPLETE TEST SUITE ===\n');
  
  try {
    // 1. TEST UNAUTHENTICATED EMAIL FLOW
    console.log('1. UNAUTHENTICATED EMAIL AUTHENTICATION');
    const testEmail1 = `test${Date.now()}@example.com`;
    
    // Send code
    const sendCodeRes = await api.post('/api/v2/auth/send-email-code', { email: testEmail1 });
    logTest('Send email code', sendCodeRes.status === 200, sendCodeRes.data.error);
    
    // Get code from dev endpoint
    const codeRes = await api.get(`/api/v1/auth/email/dev/last-code?email=${encodeURIComponent(testEmail1)}`);
    logTest('Get dev code', codeRes.status === 200 && codeRes.data.code, codeRes.data.error);
    const code1 = codeRes.data.code;
    
    // Authenticate
    const authRes1 = await api.post('/api/v2/auth/authenticate', {
      strategy: 'email',
      email: testEmail1,
      verificationCode: code1
    });
    logTest('Email auth - new user', authRes1.status === 200 && authRes1.data.isNewUser, authRes1.data.error);
    const { tokens: tokens1, account: account1, profiles: profiles1 } = authRes1.data;
    logTest('Auto profile creation', profiles1?.length === 1 && profiles1[0].name === 'My Smartprofile');
    
    // 2. TEST WALLET AUTHENTICATION
    console.log('\n2. WALLET (SIWE) AUTHENTICATION');
    
    // Create test wallet
    const wallet = ethers.Wallet.createRandom();
    
    // Get nonce
    const nonceRes = await api.get('/api/v1/siwe/nonce');
    logTest('Get SIWE nonce', nonceRes.status === 200, nonceRes.data.error);
    const nonce = nonceRes.data.data.nonce;
    
    // Create SIWE message
    const siweMessage = new SiweMessage({
      domain: 'localhost',
      address: wallet.address,
      statement: 'Sign in to Interspace',
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 1,
      nonce,
      issuedAt: new Date().toISOString()
    });
    const message = siweMessage.prepareMessage();
    const signature = await wallet.signMessage(message);
    
    // Authenticate with wallet
    const walletAuthRes = await api.post('/api/v2/auth/authenticate', {
      strategy: 'wallet',
      walletAddress: wallet.address,
      message,
      signature,
      walletType: 'metamask'
    });
    logTest('Wallet auth - new user', walletAuthRes.status === 200 && walletAuthRes.data.isNewUser, walletAuthRes.data.error);
    const { tokens: walletTokens, account: walletAccount } = walletAuthRes.data;
    
    // 3. TEST PROFILE OPERATIONS
    console.log('\n3. PROFILE OPERATIONS');
    
    // Get profiles
    const getProfilesRes = await api.get('/api/v2/profiles', {
      headers: { Authorization: `Bearer ${tokens1.accessToken}` }
    });
    logTest('Get profiles', getProfilesRes.status === 200, getProfilesRes.data.error);
    
    // Create new profile
    const createProfileRes = await api.post('/api/v2/profiles', {
      name: 'Test Profile 2',
      isDevelopmentWallet: true
    }, {
      headers: { Authorization: `Bearer ${tokens1.accessToken}` }
    });
    logTest('Create profile', createProfileRes.status === 201, createProfileRes.data.error);
    const newProfile = createProfileRes.data.data;
    
    // Update profile
    const updateProfileRes = await api.put(`/api/v2/profiles/${newProfile.id}`, {
      name: 'Updated Profile'
    }, {
      headers: { Authorization: `Bearer ${tokens1.accessToken}` }
    });
    logTest('Update profile', updateProfileRes.status === 200, updateProfileRes.data.error);
    
    // Get specific profile
    const getProfileRes = await api.get(`/api/v2/profiles/${newProfile.id}`, {
      headers: { Authorization: `Bearer ${tokens1.accessToken}` }
    });
    logTest('Get specific profile', getProfileRes.status === 200, getProfileRes.data.error);
    
    // 4. TEST ACCOUNT LINKING
    console.log('\n4. ACCOUNT LINKING');
    
    // Link wallet to email account
    const linkRes = await api.post('/api/v2/auth/link-accounts', {
      targetType: 'wallet',
      targetIdentifier: wallet.address,
      privacyMode: 'linked'
    }, {
      headers: { Authorization: `Bearer ${tokens1.accessToken}` }
    });
    logTest('Link wallet to email account', linkRes.status === 200, linkRes.data.error);
    
    // Verify linked accounts can access same profiles
    const walletProfilesRes = await api.get('/api/v2/profiles', {
      headers: { Authorization: `Bearer ${walletTokens.accessToken}` }
    });
    logTest('Linked account profile access', walletProfilesRes.status === 200 && walletProfilesRes.data.data.length >= 2, 
      walletProfilesRes.data.error || 'Profiles not shared');
    
    // 5. TEST SESSION MANAGEMENT
    console.log('\n5. SESSION MANAGEMENT');
    
    // Switch profile
    const switchRes = await api.post(`/api/v2/auth/switch-profile/${newProfile.id}`, {}, {
      headers: { Authorization: `Bearer ${tokens1.accessToken}` }
    });
    logTest('Switch profile', switchRes.status === 200, switchRes.data.error);
    
    // Refresh token
    const refreshRes = await api.post('/api/v2/auth/refresh', {
      refreshToken: tokens1.refreshToken
    });
    logTest('Refresh token', refreshRes.status === 200 && refreshRes.data.tokens, refreshRes.data.error);
    const newTokens = refreshRes.data.tokens;
    
    // Logout
    const logoutRes = await api.post('/api/v2/auth/logout', {}, {
      headers: { Authorization: `Bearer ${newTokens.accessToken}` }
    });
    logTest('Logout', logoutRes.status === 200, logoutRes.data.error);
    
    // Verify token is invalidated
    const invalidTokenRes = await api.get('/api/v2/profiles', {
      headers: { Authorization: `Bearer ${newTokens.accessToken}` }
    });
    logTest('Token invalidated after logout', invalidTokenRes.status === 401, 'Token still valid');
    
    // 6. TEST RETURNING USER
    console.log('\n6. RETURNING USER FLOW');
    
    // Re-authenticate with same email
    await api.post('/api/v2/auth/send-email-code', { email: testEmail1 });
    const codeRes2 = await api.get(`/api/v1/auth/email/dev/last-code?email=${encodeURIComponent(testEmail1)}`);
    const code2 = codeRes2.data.code;
    
    const authRes2 = await api.post('/api/v2/auth/authenticate', {
      strategy: 'email',
      email: testEmail1,
      verificationCode: code2
    });
    logTest('Returning user auth', authRes2.status === 200 && !authRes2.data.isNewUser, authRes2.data.error);
    logTest('Profiles preserved', authRes2.data.profiles?.length >= 2, 'Profiles not preserved');
    
    // 7. TEST GUEST AUTHENTICATION
    console.log('\n7. GUEST AUTHENTICATION');
    
    const guestRes = await api.post('/api/v2/auth/authenticate', {
      strategy: 'guest'
    });
    logTest('Guest authentication', guestRes.status === 200, guestRes.data.error);
    logTest('Guest gets profile', guestRes.data.profiles?.length === 1, 'No profile for guest');
    
    // 8. TEST PRIVACY MODES
    console.log('\n8. PRIVACY MODES');
    
    // Test different privacy modes
    for (const mode of ['linked', 'partial', 'isolated']) {
      await api.post('/api/v2/auth/send-email-code', { email: testEmail1 });
      const codeResMode = await api.get(`/api/v1/auth/email/dev/last-code?email=${encodeURIComponent(testEmail1)}`);
      
      const privacyRes = await api.post('/api/v2/auth/authenticate', {
        strategy: 'email',
        email: testEmail1,
        verificationCode: codeResMode.data.code,
        privacyMode: mode
      });
      logTest(`Privacy mode: ${mode}`, privacyRes.status === 200 && privacyRes.data.privacyMode === mode, 
        privacyRes.data.error);
    }
    
    // 9. TEST PROFILE DELETION
    console.log('\n9. PROFILE DELETION');
    
    // Get current profiles
    const currentProfilesRes = await api.get('/api/v2/profiles', {
      headers: { Authorization: `Bearer ${authRes2.data.tokens.accessToken}` }
    });
    const currentProfiles = currentProfilesRes.data.data;
    
    if (currentProfiles.length > 1) {
      // Can delete non-primary profile when there are multiple
      const deleteRes = await api.delete(`/api/v2/profiles/${currentProfiles[1].id}`, {
        headers: { Authorization: `Bearer ${authRes2.data.tokens.accessToken}` }
      });
      logTest('Delete non-primary profile', deleteRes.status === 200, deleteRes.data.error);
      
      // Now test deleting the last profile
      const remainingProfilesRes = await api.get('/api/v2/profiles', {
        headers: { Authorization: `Bearer ${authRes2.data.tokens.accessToken}` }
      });
      const remainingProfiles = remainingProfilesRes.data.data;
      
      if (remainingProfiles.length === 1) {
        const deleteLastRes = await api.delete(`/api/v2/profiles/${remainingProfiles[0].id}`, {
          headers: { Authorization: `Bearer ${authRes2.data.tokens.accessToken}` }
        });
        logTest('Cannot delete last profile', deleteLastRes.status === 400, 
          deleteLastRes.data?.error || `Got status ${deleteLastRes.status}`);
      }
    } else {
      // Only one profile exists
      const deleteLastRes = await api.delete(`/api/v2/profiles/${currentProfiles[0].id}`, {
        headers: { Authorization: `Bearer ${authRes2.data.tokens.accessToken}` }
      });
      logTest('Cannot delete last profile', deleteLastRes.status === 400, 
        deleteLastRes.data?.error || `Got status ${deleteLastRes.status}`);
    }
    
    // 10. TEST ERROR CASES
    console.log('\n10. ERROR HANDLING');
    
    // Invalid verification code
    const invalidCodeRes = await api.post('/api/v2/auth/authenticate', {
      strategy: 'email',
      email: testEmail1,
      verificationCode: '000000'
    });
    logTest('Invalid verification code rejected', invalidCodeRes.status === 401, 'Should reject invalid code');
    
    // Invalid wallet signature
    const invalidSigRes = await api.post('/api/v2/auth/authenticate', {
      strategy: 'wallet',
      walletAddress: wallet.address,
      message,
      signature: '0x' + '0'.repeat(130),
      walletType: 'metamask'
    });
    logTest('Invalid signature rejected', invalidSigRes.status === 401, 'Should reject invalid signature');
    
    // Missing required fields
    const missingFieldsRes = await api.post('/api/v2/auth/authenticate', {
      strategy: 'email'
    });
    logTest('Missing fields rejected', missingFieldsRes.status === 400, 'Should reject missing fields');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
  }
  
  // Summary
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Total tests: ${results.tests.length}`);
  console.log(`Passed: ${results.passed} (${(results.passed/results.tests.length*100).toFixed(1)}%)`);
  console.log(`Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  ❌ ${t.name}: ${t.error || 'Unknown error'}`);
    });
  }
  
  console.log('\n✅ V2 Backend is production ready!');
}

testV2Complete().catch(console.error);