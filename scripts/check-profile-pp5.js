#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query']
});

async function checkPp5Profile() {
  console.log('🔍 Checking for Pp5 profile...\n');

  try {
    // Find profile by name
    const profile = await prisma.smartProfile.findFirst({
      where: {
        name: {
          contains: 'Pp5',
          mode: 'insensitive'
        }
      },
      include: {
        mpcKeyShare: true,
        mpcKeyMapping: true,
        linkedAccounts: true
      }
    });

    if (!profile) {
      console.log('❌ Profile "Pp5 with mpc" not found in database');
      
      // List all profiles
      const allProfiles = await prisma.smartProfile.findMany({
        select: {
          id: true,
          name: true,
          developmentMode: true,
          createdAt: true
        }
      });
      
      console.log('\n📋 All profiles in database:');
      allProfiles.forEach(p => {
        console.log(`  - ${p.name} (${p.developmentMode ? 'dev' : 'mpc'}) - Created: ${p.createdAt}`);
      });
      
    } else {
      console.log('✅ Found profile:', profile.name);
      console.log('  ID:', profile.id);
      console.log('  Development Mode:', profile.developmentMode);
      console.log('  Session Wallet:', profile.sessionWalletAddress);
      console.log('  Created:', profile.createdAt);
      
      console.log('\n🔑 MPC Wallet Status:');
      if (profile.mpcKeyShare) {
        console.log('  ✅ Has MPC KeyShare');
        console.log('    - Created:', profile.mpcKeyShare.createdAt);
        console.log('    - Has server share:', profile.mpcKeyShare.serverShare ? 'Yes (encrypted)' : 'No');
      } else {
        console.log('  ❌ No MPC KeyShare found');
      }
      
      if (profile.mpcKeyMapping) {
        console.log('  ✅ Has MPC KeyMapping');
        console.log('    - Public Key:', profile.mpcKeyMapping.publicKey);
        console.log('    - Algorithm:', profile.mpcKeyMapping.keyAlgorithm);
        console.log('    - Has Silence Labs Key ID:', profile.mpcKeyMapping.silenceLabsKeyId ? 'Yes (encrypted)' : 'No');
      } else {
        console.log('  ❌ No MPC KeyMapping found');
      }
      
      console.log('\n💳 Linked Accounts:', profile.linkedAccounts.length);
      profile.linkedAccounts.forEach(acc => {
        console.log(`  - ${acc.address} (${acc.walletType})`);
      });
    }

    // Check MPC generation logs
    console.log('\n📝 Checking for MPC generation attempts...');
    const recentLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { contains: 'mpc' } },
          { resource: { contains: 'mpc' } },
          { details: { contains: 'mpc' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (recentLogs.length > 0) {
      console.log('Recent MPC-related audit logs:');
      recentLogs.forEach(log => {
        console.log(`  - ${log.action} on ${log.resource} at ${log.createdAt}`);
      });
    } else {
      console.log('No MPC-related audit logs found');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkPp5Profile();