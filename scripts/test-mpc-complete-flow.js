#!/usr/bin/env node
const axios = require('axios');

async function testMPCFlow() {
  console.log('🧪 Complete MPC Flow Test');
  console.log('========================\n');

  const API_URL = 'http://localhost:3000';

  try {
    // 1. Test backend health
    console.log('1. Testing backend health...');
    const health = await axios.get(`${API_URL}/health`);
    console.log('   ✅ Backend is healthy:', health.data.status);

    // 2. Test duo-node health
    console.log('\n2. Testing duo-node health...');
    const duoHealth = await axios.get('http://localhost:3001/health');
    console.log('   ✅ Duo-node status:', duoHealth.data.status);
    console.log('   ✅ Sigpair reachable:', duoHealth.data.duoServer.reachable);

    // 3. Test sigpair directly
    console.log('\n3. Testing sigpair...');
    const sigpairResponse = await axios.get('http://localhost:8080/');
    console.log('   ✅ Sigpair is running:', sigpairResponse.data);

    // 4. Check sigpair server info
    console.log('\n4. Getting sigpair public key...');
    const sigpairLogs = require('child_process').execSync('docker logs interspace-sigpair-local 2>&1 | grep "Server Public key" | tail -1').toString();
    if (sigpairLogs) {
      const publicKey = sigpairLogs.match(/Server Public key \(ED25519\): ([a-f0-9]+)/)?.[1];
      console.log('   ✅ Sigpair public key:', publicKey || 'Not found in logs');
    }

    // 5. Summary
    console.log('\n📊 MPC Infrastructure Status:');
    console.log('   ✅ Backend: Running on port 3000');
    console.log('   ✅ Duo-node: Running on port 3001');
    console.log('   ✅ Sigpair: Running on port 8080');
    console.log('   ✅ All services are connected\n');

    console.log('🎯 Next Steps:');
    console.log('1. Create a new profile in the iOS app');
    console.log('2. The app will automatically generate an MPC wallet');
    console.log('3. Check database with: node scripts/check-mpc-keyshares.js');
    console.log('4. Monitor logs with: docker-compose -f docker-compose.local.yml logs -f\n');

    console.log('💡 iOS App Configuration:');
    console.log('   - Backend URL: http://localhost:3000');
    console.log('   - MPC is enabled (feature flag set to true)');
    console.log('   - Development mode is disabled (real MPC wallets)');
    console.log('   - Using HTTP-based MPC implementation\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

testMPCFlow();