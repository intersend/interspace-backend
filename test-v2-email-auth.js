const axios = require('axios');

async function testV2EmailAuth() {
  const baseURL = 'http://localhost:3000';
  const email = `test${Date.now()}@example.com`;
  
  try {
    console.log('1. Sending email code...');
    const sendCodeResponse = await axios.post(`${baseURL}/api/v2/auth/send-email-code`, {
      email
    });
    console.log('Send code response:', sendCodeResponse.data);
    
    console.log('\n2. Getting code from dev endpoint...');
    const getCodeResponse = await axios.get(`${baseURL}/api/v1/auth/email/dev/last-code`, {
      params: { email }
    });
    console.log('Dev code response:', getCodeResponse.data);
    const code = getCodeResponse.data.code;
    
    console.log('\n3. Authenticating with code:', code);
    const authResponse = await axios.post(`${baseURL}/api/v2/auth/authenticate`, {
      strategy: 'email',
      email,
      verificationCode: code
    });
    console.log('Auth response:', JSON.stringify(authResponse.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    console.error('Status:', error.response?.status);
    if (error.response?.data?.stack) {
      console.error('Stack:', error.response.data.stack);
    }
  }
}

testV2EmailAuth();