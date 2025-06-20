const axios = require('axios');

async function testV2Profile() {
  const baseURL = 'http://localhost:3000';
  
  try {
    // 1. First authenticate
    console.log('1. Authenticating with wallet...');
    const nonceResponse = await axios.get(`${baseURL}/api/v1/siwe/nonce`);
    console.log('Nonce:', nonceResponse.data.data.nonce);
    
    // 2. Try to create a profile with authenticated user
    console.log('\n2. Creating profile...');
    const profileResponse = await axios.post(`${baseURL}/api/v1/profiles`, {
      name: 'Test Profile',
      type: 'standard'
    }, {
      headers: {
        'Authorization': 'Bearer fake-token-for-testing'
      }
    });
    console.log('Profile response:', profileResponse.data);
    
  } catch (error) {
    console.error('\nError:', error.response?.data || error.message);
    console.error('Status:', error.response?.status);
    if (error.response?.data?.error) {
      console.error('Error details:', error.response.data.error);
    }
    if (error.response?.data?.stack) {
      console.error('Stack:', error.response.data.stack);
    }
  }
}

testV2Profile();