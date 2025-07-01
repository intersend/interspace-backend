#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query']
});

async function checkMPCStatus() {
  const profileId = 'cmcklhgem000knz4esazb15yt';
  console.log(`🔍 Checking MPC status for profile: ${profileId}\n`);

  try {
    // Get profile with all MPC-related data
    const profile = await prisma.smartProfile.findUnique({
      where: { id: profileId },
      include: {
        mpcKeyShare: true,
        mpcKeyMapping: true,
        linkedAccounts: true,
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });

    if (!profile) {
      console.log('❌ Profile not found');
      return;
    }

    console.log('✅ Profile Details:');
    console.log('  Name:', profile.name);
    console.log('  ID:', profile.id);
    console.log('  User ID:', profile.userId);
    console.log('  Development Mode:', profile.developmentMode);
    console.log('  Session Wallet Address:', profile.sessionWalletAddress);
    console.log('  Created:', profile.createdAt);
    console.log('  Updated:', profile.updatedAt);

    console.log('\n🔑 MPC Wallet Status:');
    
    // Check MPC Key Share (P2 - server share)
    if (profile.mpcKeyShare) {
      console.log('  ✅ MPC KeyShare EXISTS (P2 server share)');
      console.log('    - ID:', profile.mpcKeyShare.id);
      console.log('    - Has Server Share:', profile.mpcKeyShare.serverShare ? 'Yes (encrypted)' : 'No');
      console.log('    - Created:', profile.mpcKeyShare.createdAt);
      console.log('    - Updated:', profile.mpcKeyShare.updatedAt);
    } else {
      console.log('  ❌ NO MPC KeyShare found (P2 server share missing)');
    }

    // Check MPC Key Mapping
    if (profile.mpcKeyMapping) {
      console.log('\n  ✅ MPC KeyMapping EXISTS');
      console.log('    - ID:', profile.mpcKeyMapping.id);
      console.log('    - Public Key:', profile.mpcKeyMapping.publicKey);
      console.log('    - Key Algorithm:', profile.mpcKeyMapping.keyAlgorithm);
      console.log('    - Has Silence Labs Key ID:', profile.mpcKeyMapping.silenceLabsKeyId ? 'Yes (encrypted)' : 'No');
      console.log('    - Created:', profile.mpcKeyMapping.createdAt);
    } else {
      console.log('\n  ❌ NO MPC KeyMapping found');
    }

    // Check for any MPC-related API calls
    console.log('\n📝 Checking recent API activity...');
    
    // Check audit logs for this profile
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        profileId: profileId,
        OR: [
          { action: { contains: 'mpc' } },
          { action: { contains: 'generate' } },
          { action: { contains: 'wallet' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (auditLogs.length > 0) {
      console.log('Recent MPC-related activities:');
      auditLogs.forEach(log => {
        console.log(`  - ${log.action} at ${log.createdAt}`);
        if (log.details) {
          console.log(`    Details: ${JSON.stringify(log.details)}`);
        }
      });
    } else {
      console.log('No MPC-related audit logs found for this profile');
    }

    // Summary
    console.log('\n📊 Summary:');
    if (profile.isDevelopmentWallet) {
      console.log('  ⚠️  Profile is using DEVELOPMENT wallet mode');
      console.log('  💡 MPC wallet generation was skipped because developmentMode=true');
    } else {
      if (profile.mpcKeyShare && profile.mpcKeyMapping) {
        console.log('  ✅ MPC wallet is FULLY CONFIGURED');
        console.log('  🎯 2-of-2 MPC setup complete:');
        console.log('     - P1 (client share) should be on iOS device');
        console.log('     - P2 (server share) is stored in database (encrypted)');
        console.log('     - Public key:', profile.mpcKeyMapping.publicKey);
      } else {
        console.log('  ❌ MPC wallet is NOT configured');
        console.log('  🔍 Missing components:');
        if (!profile.mpcKeyShare) console.log('     - Server key share (P2)');
        if (!profile.mpcKeyMapping) console.log('     - Key mapping and public key');
        console.log('\n  💡 Possible reasons:');
        console.log('     1. MPC generation was not triggered from iOS app');
        console.log('     2. MPC generation failed and needs to be retried');
        console.log('     3. Backend API endpoint was not called');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMPCStatus();