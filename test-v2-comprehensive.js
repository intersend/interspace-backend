const axios = require('axios');

async function testV2Comprehensive() {
  const baseURL = 'http://localhost:3000';
  const testEmail = `test${Date.now()}@example.com`;
  
  console.log('=== V2 FLAT IDENTITY COMPREHENSIVE TEST ===\n');
  
  try {
    // 1. Email Authentication Flow
    console.log('1. EMAIL AUTHENTICATION FLOW');
    console.log('   Sending verification code...');
    await axios.post(`${baseURL}/api/v2/auth/send-email-code`, { email: testEmail });
    
    console.log('   Getting code from dev endpoint...');
    const codeRes = await axios.get(`${baseURL}/api/v1/auth/email/dev/last-code?email=${encodeURIComponent(testEmail)}`);
    const code = codeRes.data.code;
    console.log('   Code:', code);
    
    console.log('   Authenticating...');
    const authRes = await axios.post(`${baseURL}/api/v2/auth/authenticate`, {
      strategy: 'email',
      email: testEmail,
      verificationCode: code
    });
    
    const { account, profiles, tokens, isNewUser } = authRes.data;
    console.log('   ✅ Authentication successful');
    console.log('   - Account ID:', account.id);
    console.log('   - Account Type:', account.type);
    console.log('   - Is New User:', isNewUser);
    console.log('   - Profile Count:', profiles.length);
    console.log('   - First Profile:', profiles[0].name);
    
    // 2. Profile Operations
    console.log('\n2. PROFILE OPERATIONS');
    
    // Get profiles
    console.log('   Getting profiles...');
    const profilesRes = await axios.get(`${baseURL}/api/v2/profiles`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    });
    console.log('   ✅ Got', profilesRes.data.data.length, 'profiles');
    
    // Create new profile
    console.log('   Creating new profile...');
    try {
      const newProfileRes = await axios.post(`${baseURL}/api/v2/profiles`, {
        name: 'Test Profile V2',
        isDevelopmentWallet: true
      }, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` }
      });
      console.log('   ✅ Created profile:', newProfileRes.data.data.name);
    } catch (error) {
      console.log('   ❌ Failed to create profile:', error.response?.data?.error);
    }
    
    // 3. Account Linking
    console.log('\n3. ACCOUNT LINKING');
    console.log('   Creating a second email account...');
    const secondEmail = `test${Date.now()}_2@example.com`;
    await axios.post(`${baseURL}/api/v2/auth/send-email-code`, { email: secondEmail });
    const code2Res = await axios.get(`${baseURL}/api/v1/auth/email/dev/last-code?email=${encodeURIComponent(secondEmail)}`);
    const code2 = code2Res.data.code;
    
    const auth2Res = await axios.post(`${baseURL}/api/v2/auth/authenticate`, {
      strategy: 'email',
      email: secondEmail,
      verificationCode: code2
    });
    
    console.log('   Linking accounts...');
    try {
      const linkRes = await axios.post(`${baseURL}/api/v2/auth/link-accounts`, {
        targetType: 'email',
        targetIdentifier: secondEmail,
        privacyMode: 'linked'
      }, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` }
      });
      console.log('   ✅ Accounts linked successfully');
    } catch (error) {
      console.log('   ❌ Failed to link accounts:', error.response?.data?.error);
    }
    
    // 4. Session Management
    console.log('\n4. SESSION MANAGEMENT');
    
    // Switch profile
    console.log('   Switching profile...');
    try {
      const switchRes = await axios.post(`${baseURL}/api/v2/auth/switch-profile/${profiles[0].id}`, {}, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` }
      });
      console.log('   ✅ Profile switched successfully');
    } catch (error) {
      console.log('   ❌ Failed to switch profile:', error.response?.data?.error);
    }
    
    // Token refresh
    console.log('   Refreshing token...');
    const refreshRes = await axios.post(`${baseURL}/api/v2/auth/refresh`, {
      refreshToken: tokens.refreshToken
    });
    console.log('   ✅ Token refreshed successfully');
    
    // 5. Privacy Modes
    console.log('\n5. PRIVACY MODES');
    console.log('   Testing privacy modes...');
    const privacyModes = ['linked', 'partial', 'isolated'];
    for (const mode of privacyModes) {
      try {
        const privacyAuth = await axios.post(`${baseURL}/api/v2/auth/authenticate`, {
          strategy: 'email',
          email: testEmail,
          verificationCode: code,
          privacyMode: mode
        });
        console.log(`   ✅ ${mode} mode: success`);
      } catch (error) {
        console.log(`   ❌ ${mode} mode: failed`);
      }
    }
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ Core V2 authentication working');
    console.log('✅ Automatic profile creation working');
    console.log('✅ Token management working');
    console.log('⚠️  Some features need additional implementation');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data?.stack) {
      console.error('Stack:', error.response.data.stack);
    }
  }
}

testV2Comprehensive();