const axios = require('axios');

async function testEmailAuth() {
  try {
    const email = 'test@example.com';
    
    // 1. Request code using V1 endpoint
    console.log('Requesting email code...');
    const codeResponse = await axios.post('http://localhost:3000/api/v1/auth/email/request-code', {
      email
    });
    console.log('Code request response:', codeResponse.data);
    
    // 2. Get the code from dev endpoint
    const devResponse = await axios.get(`http://localhost:3000/api/v1/auth/email/dev/last-code?email=${email}`);
    console.log('Dev endpoint response:', devResponse.data);
    const code = devResponse.data.code;
    
    // 3. Authenticate
    console.log('Authenticating with code:', code);
    const authResponse = await axios.post('http://localhost:3000/api/v2/auth/authenticate', {
      strategy: 'email',
      email,
      verificationCode: code
    });
    console.log('Auth response:', authResponse.data);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.status === 500) {
      console.error('Stack trace:', error.response?.data?.stack);
    }
  }
}

testEmailAuth();