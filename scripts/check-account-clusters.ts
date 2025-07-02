#!/usr/bin/env tsx
/**
 * Script to check account clusters and verify all accounts are included
 * Usage: npm run check:clusters [profileId]
 */

import { prisma } from '../src/utils/database';
import { orbyService } from '../src/services/orbyService';
import dotenv from 'dotenv';

dotenv.config();

async function checkAccountClusters(profileId?: string) {
  try {
    console.log('\n========== ACCOUNT CLUSTER CHECK ==========\n');

    // Get profiles to check
    const profiles = profileId 
      ? await prisma.smartProfile.findMany({
          where: { id: profileId },
          include: { 
            linkedAccounts: true,
            user: true 
          }
        })
      : await prisma.smartProfile.findMany({
          where: { 
            orbyAccountClusterId: { not: null }
          },
          include: { 
            linkedAccounts: true,
            user: true 
          },
          take: 10
        });

    if (profiles.length === 0) {
      console.log('No profiles found to check');
      return;
    }

    console.log(`Checking ${profiles.length} profile(s)...\n`);

    for (const profile of profiles) {
      console.log(`Profile: ${profile.name} (${profile.id})`);
      console.log(`User: ${profile.user.email || 'No email'}`);
      console.log(`Session Wallet: ${profile.sessionWalletAddress}`);
      console.log(`Orby Cluster ID: ${profile.orbyAccountClusterId || 'Not created'}`);
      console.log(`Linked Accounts: ${profile.linkedAccounts.length}`);
      
      if (profile.linkedAccounts.length > 0) {
        console.log('\n  Linked Accounts:');
        for (const account of profile.linkedAccounts) {
          console.log(`    - ${account.address}`);
          console.log(`      Type: ${account.walletType || 'unknown'}`);
          console.log(`      Strategy: ${account.authStrategy}`);
          console.log(`      Active: ${account.isActive}`);
          console.log(`      Primary: ${account.isPrimary}`);
          
          // Check if it's the MPC wallet
          if (account.walletType === 'mpc' || account.address.toLowerCase() === profile.sessionWalletAddress.toLowerCase()) {
            console.log(`      *** This is the MPC/Session wallet ***`);
          }
        }
      }

      // Check if MPC wallet is in linked accounts
      const mpcLinkedAccount = profile.linkedAccounts.find(
        la => la.walletType === 'mpc' || la.address.toLowerCase() === profile.sessionWalletAddress.toLowerCase()
      );
      
      if (!mpcLinkedAccount) {
        console.log('\n  ⚠️  WARNING: MPC wallet not found in linked accounts!');
        console.log('     The session wallet should be linked as an MPC account.');
      }

      // Test Orby integration
      if (profile.orbyAccountClusterId) {
        try {
          console.log('\n  Testing Orby portfolio fetch...');
          const portfolio = await orbyService.getFungibleTokenPortfolio(profile as any);
          console.log(`  ✅ Portfolio fetched: ${portfolio.length} tokens`);
        } catch (error) {
          console.log(`  ❌ Error fetching portfolio: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log('\n' + '='.repeat(50) + '\n');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
const profileId = process.argv[2];
checkAccountClusters(profileId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });