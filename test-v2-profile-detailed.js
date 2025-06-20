const axios = require('axios');

async function testV2ProfileDetailed() {
  const baseURL = 'http://localhost:3000';
  const email = `test${Date.now()}@example.com`;
  
  try {
    // 1. Send email code
    console.log('1. Sending email code...');
    await axios.post(`${baseURL}/api/v2/auth/send-email-code`, { email });
    
    // 2. Get code
    console.log('2. Getting code...');
    const codeResponse = await axios.get(`${baseURL}/api/v1/auth/email/dev/last-code`, {
      params: { email }
    });
    const code = codeResponse.data.code;
    
    // 3. Authenticate
    console.log('3. Authenticating with code:', code);
    const authResponse = await axios.post(`${baseURL}/api/v2/auth/authenticate`, {
      strategy: 'email',
      email,
      verificationCode: code
    });
    
    const { tokens, account, profiles } = authResponse.data;
    console.log('Auth successful:', {
      accountId: account.id,
      profileCount: profiles.length,
      firstProfile: profiles[0]
    });
    
    // 4. Try to get profiles using V2 endpoint
    console.log('\n4. Getting profiles via V2...');
    try {
      const profilesResponse = await axios.get(`${baseURL}/api/v2/profiles`, {
        headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
      });
      console.log('V2 profiles response:', profilesResponse.data);
    } catch (error) {
      console.error('V2 profiles error:', error.response?.status, error.response?.data);
    }
    
    // 5. Try to create a new profile via V2
    console.log('\n5. Creating new profile via V2...');
    try {
      const createResponse = await axios.post(`${baseURL}/api/v2/profiles`, {
        name: 'Test Profile V2'
      }, {
        headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
      });
      console.log('V2 create profile response:', createResponse.data);
    } catch (error) {
      console.error('V2 create profile error:', error.response?.status, error.response?.data);
    }
    
    // 6. Try to switch profile via V2
    console.log('\n6. Switching profile via V2...');
    try {
      const switchResponse = await axios.post(`${baseURL}/api/v2/auth/switch-profile/${profiles[0].id}`, {}, {
        headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
      });
      console.log('V2 switch profile response:', switchResponse.data);
    } catch (error) {
      console.error('V2 switch profile error:', error.response?.status, error.response?.data);
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    console.error('Status:', error.response?.status);
  }
}

testV2ProfileDetailed();