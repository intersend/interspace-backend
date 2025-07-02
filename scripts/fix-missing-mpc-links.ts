#!/usr/bin/env tsx
/**
 * Script to fix missing MPC wallet links in profiles
 * This ensures every profile's session wallet is linked as an MPC account
 * Usage: npm run fix:mpc-links [--dry-run]
 */

import { prisma, withTransaction } from '../src/utils/database';
import { orbyService } from '../src/services/orbyService';
import dotenv from 'dotenv';

dotenv.config();

const isDryRun = process.argv.includes('--dry-run');

async function fixMissingMpcLinks() {
  try {
    console.log('\n========== FIX MISSING MPC LINKS ==========\n');
    console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}\n`);

    // Find all profiles
    const profiles = await prisma.smartProfile.findMany({
      include: {
        linkedAccounts: true,
        user: true
      }
    });

    console.log(`Found ${profiles.length} profiles to check\n`);

    let fixedCount = 0;
    let errorCount = 0;

    for (const profile of profiles) {
      console.log(`\nChecking profile: ${profile.name} (${profile.id})`);
      console.log(`Session wallet: ${profile.sessionWalletAddress}`);

      // Check if MPC wallet is already linked
      const mpcLinkedAccount = profile.linkedAccounts.find(
        la => la.walletType === 'mpc' || 
             la.address.toLowerCase() === profile.sessionWalletAddress.toLowerCase()
      );

      if (mpcLinkedAccount) {
        console.log('✅ MPC wallet already linked');
        continue;
      }

      console.log('⚠️  MPC wallet NOT linked - fixing...');

      if (!isDryRun) {
        try {
          await withTransaction(async (tx) => {
            // Create LinkedAccount for MPC wallet
            await tx.linkedAccount.create({
              data: {
                userId: profile.userId,
                profileId: profile.id,
                address: profile.sessionWalletAddress.toLowerCase(),
                authStrategy: 'mpc',
                walletType: 'mpc',
                customName: 'Session Wallet',
                isPrimary: false,
                isActive: true,
                chainId: 1,
                metadata: JSON.stringify({
                  createdAt: new Date().toISOString(),
                  source: 'fix-missing-mpc-links'
                })
              }
            });

            console.log('✅ Created MPC LinkedAccount');

            // Update Orby cluster if it exists
            if (profile.orbyAccountClusterId) {
              await orbyService.updateAccountCluster(profile.id, tx);
              console.log('✅ Updated Orby cluster');
            }
          });

          fixedCount++;
        } catch (error) {
          console.error('❌ Error fixing profile:', error);
          errorCount++;
        }
      } else {
        console.log('🔵 Would create MPC LinkedAccount (dry run)');
        fixedCount++;
      }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Total profiles checked: ${profiles.length}`);
    console.log(`Profiles fixed: ${fixedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Already correct: ${profiles.length - fixedCount - errorCount}`);

    if (isDryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('Run without --dry-run to apply fixes.');
    }

  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixMissingMpcLinks()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });