const { PrismaClient } = require('@prisma/client');
const { migrateToFlatIdentity } = require('../../scripts/migrate-to-flat-identity');

const prisma = new PrismaClient();

describe('Flat Identity Migration Tests', () => {
  beforeAll(async () => {
    // Clean database before tests
    await cleanDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function cleanDatabase() {
    // Clean in dependency order
    await prisma.accountSession.deleteMany();
    await prisma.profileAccount.deleteMany();
    await prisma.identityLink.deleteMany();
    await prisma.account.deleteMany();
    await prisma.tokenAllowance.deleteMany();
    await prisma.linkedAccount.deleteMany();
    await prisma.bookmarkedApp.deleteMany();
    await prisma.folder.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.smartProfile.deleteMany();
    await prisma.socialProfile.deleteMany();
    await prisma.blacklistedToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  }

  describe('User Migration', () => {
    it('should migrate user with email to account', async () => {
      // Create legacy user
      const user = await prisma.user.create({
        data: {
          email: 'legacy@example.com',
          emailVerified: true,
          hashedPassword: 'hashed_password'
        }
      });

      // Run migration
      await migrateToFlatIdentity();

      // Verify account was created
      const account = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'email',
            identifier: 'legacy@example.com'
          }
        }
      });

      expect(account).toBeTruthy();
      expect(account.verified).toBe(true);
      expect(account.metadata).toEqual({
        userId: user.id,
        migratedFrom: 'user.email'
      });
    });

    it('should migrate user with wallet to account', async () => {
      const user = await prisma.user.create({
        data: {
          walletAddress: '0xlegacywallet123',
          isGuest: false
        }
      });

      await migrateToFlatIdentity();

      const account = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'wallet',
            identifier: '0xlegacywallet123'
          }
        }
      });

      expect(account).toBeTruthy();
      expect(account.verified).toBe(true);
      expect(account.metadata).toEqual({
        userId: user.id,
        migratedFrom: 'user.walletAddress'
      });
    });

    it('should migrate user with both email and wallet', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'both@example.com',
          emailVerified: true,
          walletAddress: '0xbothwallet123'
        }
      });

      await migrateToFlatIdentity();

      // Should create two accounts
      const emailAccount = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'email',
            identifier: 'both@example.com'
          }
        }
      });

      const walletAccount = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'wallet',
            identifier: '0xbothwallet123'
          }
        }
      });

      expect(emailAccount).toBeTruthy();
      expect(walletAccount).toBeTruthy();

      // Should be linked
      const link = await prisma.identityLink.findFirst({
        where: {
          OR: [
            {
              accountAId: emailAccount.id,
              accountBId: walletAccount.id
            },
            {
              accountAId: walletAccount.id,
              accountBId: emailAccount.id
            }
          ]
        }
      });

      expect(link).toBeTruthy();
      expect(link.linkType).toBe('direct');
      expect(link.privacyMode).toBe('linked');
    });
  });

  describe('Social Profile Migration', () => {
    it('should migrate social profiles to accounts', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'social@example.com'
        }
      });

      const googleProfile = await prisma.socialProfile.create({
        data: {
          userId: user.id,
          provider: 'google',
          providerId: 'google_12345',
          username: 'googleuser',
          displayName: 'Google User',
          avatarUrl: 'https://google.com/avatar.jpg'
        }
      });

      const discordProfile = await prisma.socialProfile.create({
        data: {
          userId: user.id,
          provider: 'discord',
          providerId: 'discord_67890',
          username: 'discorduser'
        }
      });

      await migrateToFlatIdentity();

      // Verify social accounts created
      const googleAccount = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'social',
            identifier: 'google_12345'
          }
        }
      });

      expect(googleAccount).toBeTruthy();
      expect(googleAccount.provider).toBe('google');
      expect(googleAccount.metadata).toMatchObject({
        username: 'googleuser',
        displayName: 'Google User',
        avatarUrl: 'https://google.com/avatar.jpg'
      });

      const discordAccount = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'social',
            identifier: 'discord_67890'
          }
        }
      });

      expect(discordAccount).toBeTruthy();
      expect(discordAccount.provider).toBe('discord');
    });
  });

  describe('Linked Account Migration', () => {
    it('should migrate linked accounts to flat model', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'linked@example.com'
        }
      });

      const profile = await prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Test Profile',
          sessionWalletAddress: '0xsession123'
        }
      });

      const linkedAccount1 = await prisma.linkedAccount.create({
        data: {
          userId: user.id,
          profileId: profile.id,
          address: '0xlinked111',
          authStrategy: 'wallet',
          walletType: 'metamask',
          customName: 'My MetaMask'
        }
      });

      const linkedAccount2 = await prisma.linkedAccount.create({
        data: {
          userId: user.id,
          profileId: profile.id,
          address: '0xlinked222',
          authStrategy: 'wallet',
          walletType: 'coinbase'
        }
      });

      await migrateToFlatIdentity();

      // Verify accounts created for linked accounts
      const account1 = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'wallet',
            identifier: '0xlinked111'
          }
        }
      });

      expect(account1).toBeTruthy();
      expect(account1.metadata).toMatchObject({
        walletType: 'metamask',
        customName: 'My MetaMask',
        migratedFrom: 'linkedAccount'
      });

      const account2 = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'wallet',
            identifier: '0xlinked222'
          }
        }
      });

      expect(account2).toBeTruthy();
    });
  });

  describe('Profile Account Linking', () => {
    it('should link all user accounts to their profiles', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'profile@example.com',
          walletAddress: '0xprofile123'
        }
      });

      const profile1 = await prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Profile 1',
          sessionWalletAddress: '0xsession1'
        }
      });

      const profile2 = await prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Profile 2',
          sessionWalletAddress: '0xsession2'
        }
      });

      await migrateToFlatIdentity();

      // Get created accounts
      const emailAccount = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'email',
            identifier: 'profile@example.com'
          }
        }
      });

      const walletAccount = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'wallet',
            identifier: '0xprofile123'
          }
        }
      });

      // Verify both accounts are linked to both profiles
      const profileAccounts = await prisma.profileAccount.findMany({
        where: {
          OR: [
            { accountId: emailAccount.id },
            { accountId: walletAccount.id }
          ]
        }
      });

      expect(profileAccounts).toHaveLength(4); // 2 accounts * 2 profiles

      // Verify profile1 has both accounts
      const profile1Accounts = await prisma.profileAccount.findMany({
        where: { profileId: profile1.id }
      });
      expect(profile1Accounts).toHaveLength(2);

      // Verify profile2 has both accounts
      const profile2Accounts = await prisma.profileAccount.findMany({
        where: { profileId: profile2.id }
      });
      expect(profile2Accounts).toHaveLength(2);
    });

    it('should set createdByAccountId on profiles', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'creator@example.com'
        }
      });

      const profile = await prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Created Profile',
          sessionWalletAddress: '0xcreated'
        }
      });

      await migrateToFlatIdentity();

      const updatedProfile = await prisma.smartProfile.findUnique({
        where: { id: profile.id }
      });

      expect(updatedProfile.createdByAccountId).toBeTruthy();

      // Should be the email account
      const creatorAccount = await prisma.account.findUnique({
        where: { id: updatedProfile.createdByAccountId }
      });

      expect(creatorAccount.type).toBe('email');
      expect(creatorAccount.identifier).toBe('creator@example.com');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle user with multiple profiles and linked accounts', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'complex@example.com',
          walletAddress: '0xcomplex123'
        }
      });

      // Add social profiles
      await prisma.socialProfile.create({
        data: {
          userId: user.id,
          provider: 'google',
          providerId: 'google_complex'
        }
      });

      // Create profiles
      const tradingProfile = await prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Trading',
          sessionWalletAddress: '0xtrading'
        }
      });

      const gamingProfile = await prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Gaming',
          sessionWalletAddress: '0xgaming'
        }
      });

      // Add linked accounts
      await prisma.linkedAccount.createMany({
        data: [
          {
            userId: user.id,
            profileId: tradingProfile.id,
            address: '0xtrading1',
            authStrategy: 'wallet'
          },
          {
            userId: user.id,
            profileId: tradingProfile.id,
            address: '0xtrading2',
            authStrategy: 'wallet'
          },
          {
            userId: user.id,
            profileId: gamingProfile.id,
            address: '0xgaming1',
            authStrategy: 'wallet'
          }
        ]
      });

      await migrateToFlatIdentity();

      // Count created accounts
      const accounts = await prisma.account.findMany({
        where: {
          metadata: {
            path: ['userId'],
            equals: user.id
          }
        }
      });

      // Should have: email + wallet + google + 3 linked accounts = 6 total
      expect(accounts).toHaveLength(6);

      // Verify all accounts are linked
      const links = await prisma.identityLink.findMany();
      expect(links.length).toBeGreaterThan(0);

      // Verify profiles are accessible from all accounts
      const emailAccount = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'email',
            identifier: 'complex@example.com'
          }
        }
      });

      const profileAccounts = await prisma.profileAccount.findMany({
        where: { accountId: emailAccount.id }
      });

      expect(profileAccounts).toHaveLength(2); // Both profiles
    });

    it('should not create duplicate accounts', async () => {
      const user = await prisma.user.create({
        data: {
          walletAddress: '0xduplicate123'
        }
      });

      const profile = await prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Test',
          sessionWalletAddress: '0xtest'
        }
      });

      // Create linked account with same address as user wallet
      await prisma.linkedAccount.create({
        data: {
          userId: user.id,
          profileId: profile.id,
          address: '0xduplicate123', // Same as user wallet
          authStrategy: 'wallet'
        }
      });

      await migrateToFlatIdentity();

      // Should only create one account
      const accounts = await prisma.account.findMany({
        where: {
          type: 'wallet',
          identifier: '0xduplicate123'
        }
      });

      expect(accounts).toHaveLength(1);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve all user data after migration', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'integrity@example.com',
          emailVerified: true,
          twoFactorEnabled: true,
          authStrategies: 'email,google'
        }
      });

      const profile = await prisma.smartProfile.create({
        data: {
          userId: user.id,
          name: 'Integrity Test',
          sessionWalletAddress: '0xintegrity',
          orbyAccountClusterId: 'cluster_123'
        }
      });

      const folder = await prisma.folder.create({
        data: {
          profileId: profile.id,
          name: 'DeFi Apps',
          color: '#FF0000'
        }
      });

      const app = await prisma.bookmarkedApp.create({
        data: {
          profileId: profile.id,
          folderId: folder.id,
          name: 'Uniswap',
          url: 'https://uniswap.org'
        }
      });

      await migrateToFlatIdentity();

      // Verify all data still exists
      const userAfter = await prisma.user.findUnique({
        where: { id: user.id }
      });
      expect(userAfter).toBeTruthy();
      expect(userAfter.twoFactorEnabled).toBe(true);

      const profileAfter = await prisma.smartProfile.findUnique({
        where: { id: profile.id },
        include: {
          folders: {
            include: { apps: true }
          }
        }
      });
      expect(profileAfter).toBeTruthy();
      expect(profileAfter.orbyAccountClusterId).toBe('cluster_123');
      expect(profileAfter.folders).toHaveLength(1);
      expect(profileAfter.folders[0].apps).toHaveLength(1);
    });
  });
});