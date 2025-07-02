#!/usr/bin/env tsx
/**
 * Script to debug profile lookup issues
 * Usage: npm run debug:profile [userId] [profileId]
 */

import { prisma } from '../src/utils/database';
import dotenv from 'dotenv';

dotenv.config();

async function debugProfileLookup(userId?: string, profileId?: string) {
  try {
    console.log('\n========== PROFILE LOOKUP DEBUG ==========\n');

    // If specific IDs provided, check those
    if (userId && profileId) {
      console.log(`Looking for profile: ${profileId}`);
      console.log(`For user: ${userId}\n`);

      // Check if profile exists at all
      const profileExists = await prisma.smartProfile.findUnique({
        where: { id: profileId },
        include: { user: true }
      });

      if (!profileExists) {
        console.log('❌ Profile does not exist with this ID');
      } else {
        console.log('✅ Profile exists');
        console.log(`   Owner: ${profileExists.user.email || profileExists.userId}`);
        console.log(`   Owner ID: ${profileExists.userId}`);
        console.log(`   Name: ${profileExists.name}`);
        console.log(`   Session Wallet: ${profileExists.sessionWalletAddress}`);
        
        if (profileExists.userId !== userId) {
          console.log(`\n⚠️  Profile belongs to different user!`);
          console.log(`   Expected: ${userId}`);
          console.log(`   Actual: ${profileExists.userId}`);
        }
      }

      // Check what profiles the user actually has
      console.log(`\n\nProfiles for user ${userId}:`);
      const userProfiles = await prisma.smartProfile.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true
        }
      });

      if (userProfiles.length === 0) {
        console.log('❌ User has no profiles');
      } else {
        userProfiles.forEach(p => {
          console.log(`   - ${p.id}: ${p.name} (Active: ${p.isActive})`);
        });
      }

    } else {
      // General debug - show recent profiles and users
      console.log('Recent profiles:\n');
      
      const recentProfiles = await prisma.smartProfile.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              walletAddress: true
            }
          },
          _count: {
            select: {
              linkedAccounts: true
            }
          }
        }
      });

      recentProfiles.forEach(profile => {
        console.log(`Profile: ${profile.id}`);
        console.log(`  Name: ${profile.name}`);
        console.log(`  User: ${profile.user.email || profile.user.walletAddress || profile.userId}`);
        console.log(`  User ID: ${profile.userId}`);
        console.log(`  Session Wallet: ${profile.sessionWalletAddress}`);
        console.log(`  Linked Accounts: ${profile._count.linkedAccounts}`);
        console.log(`  Active: ${profile.isActive}`);
        console.log(`  Created: ${profile.createdAt.toISOString()}`);
        console.log('---');
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
const userId = process.argv[2];
const profileId = process.argv[3];

debugProfileLookup(userId, profileId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });