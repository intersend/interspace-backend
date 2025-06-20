const { PrismaClient } = require('@prisma/client');
const logger = require('../src/utils/logger');

const prisma = new PrismaClient();

/**
 * Migration script to transition from hierarchical to flat identity model
 */
async function migrateToFlatIdentity() {
  console.log('Starting migration to flat identity model...');
  
  try {
    // Start transaction
    await prisma.$transaction(async (tx) => {
      
      // Step 1: Create accounts for existing users
      console.log('Step 1: Creating accounts for existing users...');
      
      const users = await tx.user.findMany({
        include: {
          socialProfiles: true,
          linkedAccounts: true
        }
      });

      const accountMapping = new Map(); // userId -> accountIds
      
      for (const user of users) {
        const userAccounts = [];
        
        // Create account for email
        if (user.email) {
          const emailAccount = await tx.account.create({
            data: {
              type: 'email',
              identifier: user.email.toLowerCase(),
              verified: user.emailVerified,
              metadata: {
                userId: user.id,
                migratedFrom: 'user.email'
              }
            }
          });
          userAccounts.push(emailAccount.id);
          console.log(`  Created email account for user ${user.id}: ${emailAccount.id}`);
        }
        
        // Create account for wallet
        if (user.walletAddress) {
          const walletAccount = await tx.account.create({
            data: {
              type: 'wallet',
              identifier: user.walletAddress.toLowerCase(),
              verified: true,
              metadata: {
                userId: user.id,
                migratedFrom: 'user.walletAddress'
              }
            }
          });
          userAccounts.push(walletAccount.id);
          console.log(`  Created wallet account for user ${user.id}: ${walletAccount.id}`);
        }
        
        // Create accounts for social profiles
        for (const social of user.socialProfiles) {
          const socialAccount = await tx.account.create({
            data: {
              type: 'social',
              identifier: social.providerId,
              provider: social.provider,
              verified: true,
              metadata: {
                userId: user.id,
                username: social.username,
                displayName: social.displayName,
                avatarUrl: social.avatarUrl,
                migratedFrom: 'socialProfile'
              }
            }
          });
          userAccounts.push(socialAccount.id);
          console.log(`  Created ${social.provider} account for user ${user.id}: ${socialAccount.id}`);
        }
        
        // Create accounts for linked accounts (additional wallets)
        for (const linked of user.linkedAccounts) {
          // Check if we already created this wallet account
          const existing = await tx.account.findUnique({
            where: {
              type_identifier: {
                type: 'wallet',
                identifier: linked.address.toLowerCase()
              }
            }
          });
          
          if (!existing) {
            const linkedAccount = await tx.account.create({
              data: {
                type: 'wallet',
                identifier: linked.address.toLowerCase(),
                verified: true,
                metadata: {
                  userId: user.id,
                  walletType: linked.walletType,
                  customName: linked.customName,
                  migratedFrom: 'linkedAccount'
                }
              }
            });
            userAccounts.push(linkedAccount.id);
            console.log(`  Created linked wallet account for user ${user.id}: ${linkedAccount.id}`);
          } else {
            userAccounts.push(existing.id);
          }
        }
        
        accountMapping.set(user.id, userAccounts);
      }
      
      // Step 2: Link accounts belonging to the same user
      console.log('\nStep 2: Creating identity links...');
      
      for (const [userId, accountIds] of accountMapping.entries()) {
        // Link all accounts of the same user together
        for (let i = 0; i < accountIds.length; i++) {
          for (let j = i + 1; j < accountIds.length; j++) {
            const [firstId, secondId] = [accountIds[i], accountIds[j]].sort();
            
            await tx.identityLink.create({
              data: {
                accountAId: firstId,
                accountBId: secondId,
                linkType: 'direct',
                privacyMode: 'linked',
                confidenceScore: 1.0
              }
            });
            
            console.log(`  Linked accounts: ${firstId} <-> ${secondId}`);
          }
        }
      }
      
      // Step 3: Link accounts to profiles
      console.log('\nStep 3: Linking accounts to profiles...');
      
      const profiles = await tx.smartProfile.findMany({
        include: {
          user: true,
          linkedAccounts: true
        }
      });
      
      for (const profile of profiles) {
        const userAccountIds = accountMapping.get(profile.userId) || [];
        
        // Link all user accounts to this profile
        for (const accountId of userAccountIds) {
          // Check if already linked
          const existing = await tx.profileAccount.findUnique({
            where: {
              profileId_accountId: {
                profileId: profile.id,
                accountId: accountId
              }
            }
          });
          
          if (!existing) {
            // Determine if this should be primary
            // Make the first account primary, or the one matching profile's linked accounts
            const isPrimary = userAccountIds.indexOf(accountId) === 0;
            
            await tx.profileAccount.create({
              data: {
                profileId: profile.id,
                accountId: accountId,
                isPrimary: isPrimary,
                permissions: {
                  canTransact: true,
                  canManageProfile: true
                }
              }
            });
            
            console.log(`  Linked account ${accountId} to profile ${profile.id} (${profile.name})`);
          }
        }
        
        // Update profile with createdByAccountId
        if (userAccountIds.length > 0) {
          await tx.smartProfile.update({
            where: { id: profile.id },
            data: { createdByAccountId: userAccountIds[0] }
          });
        }
      }
      
      console.log('\nMigration completed successfully!');
      
      // Step 4: Generate summary
      const accountCount = await tx.account.count();
      const linkCount = await tx.identityLink.count();
      const profileAccountCount = await tx.profileAccount.count();
      
      console.log('\nMigration Summary:');
      console.log(`  - Created ${accountCount} accounts`);
      console.log(`  - Created ${linkCount} identity links`);
      console.log(`  - Created ${profileAccountCount} profile-account links`);
      console.log(`  - Migrated ${users.length} users`);
      console.log(`  - Updated ${profiles.length} profiles`);
    });
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToFlatIdentity()
    .then(() => {
      console.log('Migration completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateToFlatIdentity };