#!/usr/bin/env node

/**
 * Script to check MPC keyshares in the database
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function checkMPCKeyshares() {
  try {
    console.log('🔍 Checking MPC Keyshares in database...\n');

    // Get all users
    const users = await prisma.user.findMany({
      include: {
        smartProfiles: true
      }
    });

    console.log(`Found ${users.length} users\n`);

    for (const user of users) {
      console.log(`User: ${user.email || user.walletAddress || user.id}`);
      console.log(`  Profiles: ${user.smartProfiles.length}`);
      
      for (const profile of user.smartProfiles) {
        console.log(`\n  Profile: ${profile.name} (ID: ${profile.id})`);
        console.log(`    Session Wallet: ${profile.sessionWalletAddress}`);
        console.log(`    Active: ${profile.isActive}`);

        // Check MPC key share
        const keyShare = await prisma.mpcKeyShare.findUnique({
          where: { profileId: profile.id }
        });

        if (keyShare) {
          console.log(`    ✅ Has MPC KeyShare`);
          console.log(`       Created: ${keyShare.createdAt}`);
          console.log(`       Server Share (truncated): ${keyShare.serverShare.substring(0, 50)}...`);
        } else {
          console.log(`    ❌ No MPC KeyShare`);
        }

        // Check MPC key mapping
        const keyMapping = await prisma.mpcKeyMapping.findUnique({
          where: { profileId: profile.id }
        });

        if (keyMapping) {
          console.log(`    ✅ Has MPC KeyMapping`);
          console.log(`       Silence Labs Key ID: ${keyMapping.silenceLabsKeyId}`);
          console.log(`       Public Key: ${keyMapping.publicKey}`);
          console.log(`       Algorithm: ${keyMapping.keyAlgorithm}`);
          console.log(`       Created: ${keyMapping.createdAt}`);
        } else {
          console.log(`    ❌ No MPC KeyMapping`);
        }
      }
      console.log('\n' + '='.repeat(80) + '\n');
    }

    // Summary
    const totalProfiles = await prisma.smartProfile.count();
    const profilesWithKeyShares = await prisma.mpcKeyShare.count();
    const profilesWithKeyMappings = await prisma.mpcKeyMapping.count();

    console.log('📊 Summary:');
    console.log(`  Total Profiles: ${totalProfiles}`);
    console.log(`  Profiles with KeyShares: ${profilesWithKeyShares}`);
    console.log(`  Profiles with KeyMappings: ${profilesWithKeyMappings}`);

    // List all MPC key mappings
    console.log('\n📋 All MPC Key Mappings:');
    const allMappings = await prisma.mpcKeyMapping.findMany({
      include: {
        profile: {
          include: {
            user: true
          }
        }
      }
    });

    for (const mapping of allMappings) {
      console.log(`\n  Key ID: ${mapping.silenceLabsKeyId}`);
      console.log(`  Profile: ${mapping.profile.name}`);
      console.log(`  User: ${mapping.profile.user.email || mapping.profile.user.walletAddress || mapping.profile.user.id}`);
      console.log(`  Public Key: ${mapping.publicKey}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkMPCKeyshares().catch(console.error);