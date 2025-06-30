const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('@/index').default; // Import the default export
const { generateTokens } = require('@/utils/tokenUtils');
const { siweService } = require('@/services/siweService');
const sessionWalletService = require('@/services/sessionWalletService');

const prisma = new PrismaClient();

describe('V2 Authentication Flow Integration Tests', () => {
  let server;

  beforeAll(async () => {
    // Clean database
    await cleanDatabase();
    
    // Start server
    server = app.listen(0); // Random port
  });

  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function cleanDatabase() {
    // Clean in correct order due to foreign keys
    await prisma.accountSession.deleteMany();
    await prisma.profileAccount.deleteMany();
    await prisma.identityLink.deleteMany();
    await prisma.tokenAllowance.deleteMany();
    await prisma.linkedAccount.deleteMany();
    await prisma.bookmarkedApp.deleteMany();
    await prisma.folder.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.smartProfile.deleteMany();
    await prisma.account.deleteMany();
    await prisma.blacklistedToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  }

  describe('New User Registration Flow', () => {
    it('should create account and profile automatically for wallet auth', async () => {
      const walletAddress = '0x1234567890abcdef1234567890abcdef12345678';
      const signature = '0xvalidsignature';
      const message = 'Sign this message to authenticate with Interspace';

      // Mock wallet signature verification
      jest.spyOn(siweService, 'verifyMessage')
        .mockResolvedValueOnce({
          valid: true,
          address: walletAddress
        });

      // Mock session wallet creation
      jest.spyOn(sessionWalletService, 'createSessionWallet')
        .mockResolvedValueOnce({
          address: '0xsession123',
          isDevelopment: false
        });

      const response = await request(server)
        .post('/api/v2/auth/authenticate')
        .send({
          strategy: 'wallet',
          walletAddress,
          signature,
          message,
          walletType: 'metamask'
        })
        .expect(200);

      console.log('Response body:', JSON.stringify(response.body, null, 2));

      expect(response.body).toMatchObject({
        success: true,
        account: {
          strategy: 'wallet',
          identifier: walletAddress.toLowerCase()
        },
        profiles: [
          {
            displayName: 'My Smartprofile',
            isActive: true
          }
        ],
        isNewUser: true,
        privacyMode: 'linked'
      });

      // Verify database state
      const account = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'wallet',
            identifier: walletAddress.toLowerCase()
          }
        }
      });
      expect(account).toBeTruthy();

      // Find profiles linked to this account through ProfileAccount
      const profileAccounts = await prisma.profileAccount.findMany({
        where: { accountId: account.id },
        include: { profile: true }
      });
      expect(profileAccounts).toHaveLength(1);
      const profile = profileAccounts[0].profile;
      expect(profile.name).toBe('My Smartprofile');

      const profileAccount = profileAccounts[0];
      expect(profileAccount).toBeTruthy();
      expect(profileAccount.isPrimary).toBe(true);

      // Verify that wallet account was automatically linked
      const linkedAccount = await prisma.linkedAccount.findFirst({
        where: {
          profileId: profile.id,
          address: walletAddress.toLowerCase()
        }
      });
      expect(linkedAccount).toBeTruthy();
      expect(linkedAccount.authStrategy).toBe('wallet');
      expect(linkedAccount.walletType).toBe('metamask');
      expect(linkedAccount.isPrimary).toBe(true);
      expect(linkedAccount.isActive).toBe(true);
    });

    it('should create account for email authentication', async () => {
      const email = 'test@example.com';
      const verificationCode = '123456';

      // Mock email verification - need to mock the database query for email verification
      jest.spyOn(prisma.emailVerification, 'findMany')
        .mockResolvedValueOnce([{
          email: email.toLowerCase(),
          code: '$2a$10$validhashedcode', // Mock bcrypt hash
          expiresAt: new Date(Date.now() + 3600000),
          attempts: 0
        }]);
        
      // Mock bcrypt comparison
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);

      jest.spyOn(sessionWalletService, 'createSessionWallet')
        .mockResolvedValueOnce({
          address: '0xsession456',
          isDevelopment: false
        });

      const response = await request(server)
        .post('/api/v2/auth/authenticate')
        .send({
          strategy: 'email',
          email,
          verificationCode
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        account: {
          type: 'email',
          identifier: email.toLowerCase()
        },
        isNewUser: true
      });

      const account = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'email',
            identifier: email.toLowerCase()
          }
        }
      });
      expect(account).toBeTruthy();
    });
  });

  describe('Existing User Authentication', () => {
    let existingAccount;
    let existingProfile;
    let existingUser;

    beforeEach(async () => {
      // Create existing user with profile
      existingUser = await prisma.user.create({
        data: {
          email: 'existing@example.com',
          emailVerified: true,
          authStrategies: 'email'
        }
      });

      existingAccount = await prisma.account.create({
        data: {
          type: 'email',
          identifier: 'existing@example.com',
          verified: true,
          metadata: { userId: existingUser.id }
        }
      });

      existingProfile = await prisma.smartProfile.create({
        data: {
          name: 'Existing Profile',
          userId: existingUser.id,
          sessionWalletAddress: '0xexisting123',
          isActive: true,
          createdByAccountId: existingAccount.id
        }
      });

      await prisma.profileAccount.create({
        data: {
          profileId: existingProfile.id,
          accountId: existingAccount.id,
          isPrimary: true
        }
      });
    });

    it('should return existing profiles for returning user', async () => {
      jest.spyOn(require('../../src/services/socialAuthService'), 'authenticateWithEmail')
        .mockResolvedValueOnce({
          user: existingUser
        });

      const response = await request(server)
        .post('/api/v2/auth/authenticate')
        .send({
          strategy: 'email',
          email: 'existing@example.com',
          verificationCode: '123456'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        account: {
          id: existingAccount.id,
          type: 'email',
          identifier: 'existing@example.com'
        },
        profiles: [
          {
            id: existingProfile.id,
            name: 'Existing Profile',
            isActive: true
          }
        ],
        isNewUser: false
      });
    });
  });

  describe('Account Linking Flow', () => {
    let primaryAccount;
    let primaryProfile;
    let authToken;

    beforeEach(async () => {
      // Create primary account with profile
      const user = await prisma.user.create({
        data: {
          email: 'primary@example.com',
          emailVerified: true
        }
      });

      primaryAccount = await prisma.account.create({
        data: {
          type: 'email',
          identifier: 'primary@example.com',
          verified: true
        }
      });

      primaryProfile = await prisma.smartProfile.create({
        data: {
          name: 'Primary Profile',
          userId: user.id,
          sessionWalletAddress: '0xprimary123',
          isActive: true,
          createdByAccountId: primaryAccount.id
        }
      });

      await prisma.profileAccount.create({
        data: {
          profileId: primaryProfile.id,
          accountId: primaryAccount.id,
          isPrimary: true
        }
      });

      // Generate auth token
      const tokens = await generateTokens({
        userId: user.id,
        accountId: primaryAccount.id,
        sessionToken: 'test_session'
      });
      authToken = tokens.accessToken;
    });

    it('should link wallet account to existing email account', async () => {
      const response = await request(server)
        .post('/api/v2/auth/link-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'wallet',
          targetIdentifier: '0x9876543210fedcba9876543210fedcba98765432',
          privacyMode: 'linked'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        linkedAccount: {
          type: 'wallet',
          identifier: '0x9876543210fedcba9876543210fedcba98765432'
        }
      });

      // Verify link was created
      const link = await prisma.identityLink.findFirst({
        where: {
          OR: [
            { accountAId: primaryAccount.id },
            { accountBId: primaryAccount.id }
          ]
        }
      });
      expect(link).toBeTruthy();
      expect(link.privacyMode).toBe('linked');
    });

    it('should respect privacy mode when linking', async () => {
      const response = await request(server)
        .post('/api/v2/auth/link-accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'social',
          targetIdentifier: 'google_12345',
          targetProvider: 'google',
          privacyMode: 'isolated'
        })
        .expect(200);

      const link = await prisma.identityLink.findFirst({
        where: {
          OR: [
            { accountAId: primaryAccount.id },
            { accountBId: primaryAccount.id }
          ]
        }
      });
      expect(link.privacyMode).toBe('isolated');
    });
  });

  describe('Privacy Mode Scenarios', () => {
    it('should create isolated account', async () => {
      jest.spyOn(require('../../src/services/socialAuthService'), 'authenticateWithWallet')
        .mockResolvedValueOnce({
          user: { id: 'usr_isolated', isGuest: false }
        });

      jest.spyOn(require('../../src/services/sessionWalletService'), 'createSessionWallet')
        .mockResolvedValueOnce({
          address: '0xisolated123',
          isDevelopment: false
        });

      const response = await request(server)
        .post('/api/v2/auth/authenticate')
        .send({
          strategy: 'wallet',
          walletAddress: '0xisolated',
          signature: '0xsig',
          message: 'msg',
          privacyMode: 'isolated'
        })
        .expect(200);

      expect(response.body.privacyMode).toBe('isolated');

      const session = await prisma.accountSession.findFirst({
        where: { accountId: response.body.account.id }
      });
      expect(session.privacyMode).toBe('isolated');
    });
  });

  describe('Identity Graph Queries', () => {
    let account1, account2, account3;
    let authToken;

    beforeEach(async () => {
      // Create three linked accounts
      account1 = await prisma.account.create({
        data: { type: 'wallet', identifier: '0xacc1', verified: true }
      });
      account2 = await prisma.account.create({
        data: { type: 'email', identifier: 'acc2@example.com', verified: true }
      });
      account3 = await prisma.account.create({
        data: { type: 'social', identifier: 'google_acc3', provider: 'google', verified: true }
      });

      // Link 1-2 (linked mode)
      await prisma.identityLink.create({
        data: {
          accountAId: account1.id,
          accountBId: account2.id,
          linkType: 'direct',
          privacyMode: 'linked'
        }
      });

      // Link 2-3 (partial mode)
      await prisma.identityLink.create({
        data: {
          accountAId: account2.id,
          accountBId: account3.id,
          linkType: 'direct',
          privacyMode: 'partial'
        }
      });

      // Create user and token for testing
      const user = await prisma.user.create({
        data: { walletAddress: '0xacc1' }
      });

      const tokens = await generateTokens({
        userId: user.id,
        accountId: account1.id,
        sessionToken: 'graph_session'
      });
      authToken = tokens.accessToken;
    });

    it('should return complete identity graph', async () => {
      const response = await request(server)
        .get('/api/v2/auth/identity-graph')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        currentAccountId: account1.id,
        accounts: expect.arrayContaining([
          expect.objectContaining({ id: account1.id }),
          expect.objectContaining({ id: account2.id }),
          expect.objectContaining({ id: account3.id })
        ]),
        links: expect.arrayContaining([
          expect.objectContaining({
            accountAId: account1.id,
            accountBId: account2.id,
            privacyMode: 'linked'
          }),
          expect.objectContaining({
            accountAId: account2.id,
            accountBId: account3.id,
            privacyMode: 'partial'
          })
        ])
      });
    });
  });

  describe('Profile Switching', () => {
    let account;
    let profile1, profile2;
    let authToken;
    let sessionToken;

    beforeEach(async () => {
      const user = await prisma.user.create({
        data: { email: 'switcher@example.com' }
      });

      account = await prisma.account.create({
        data: {
          type: 'email',
          identifier: 'switcher@example.com',
          verified: true
        }
      });

      profile1 = await prisma.smartProfile.create({
        data: {
          name: 'Profile 1',
          userId: user.id,
          sessionWalletAddress: '0xprofile1',
          isActive: true
        }
      });

      profile2 = await prisma.smartProfile.create({
        data: {
          name: 'Profile 2',
          userId: user.id,
          sessionWalletAddress: '0xprofile2',
          isActive: false
        }
      });

      // Link both profiles to account
      await prisma.profileAccount.createMany({
        data: [
          { profileId: profile1.id, accountId: account.id, isPrimary: true },
          { profileId: profile2.id, accountId: account.id, isPrimary: false }
        ]
      });

      sessionToken = 'switch_session_' + Date.now();
      
      // Create session
      await prisma.accountSession.create({
        data: {
          accountId: account.id,
          sessionToken,
          activeProfileId: profile1.id,
          privacyMode: 'linked',
          expiresAt: new Date(Date.now() + 3600000)
        }
      });

      const tokens = await generateTokens({
        userId: user.id,
        accountId: account.id,
        sessionToken
      });
      authToken = tokens.accessToken;
    });

    it('should switch between profiles', async () => {
      const response = await request(server)
        .post(`/api/v2/auth/switch-profile/${profile2.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        activeProfile: {
          id: profile2.id,
          name: 'Profile 2'
        }
      });

      // Verify session was updated
      const session = await prisma.accountSession.findUnique({
        where: { sessionToken }
      });
      expect(session.activeProfileId).toBe(profile2.id);

      // Verify profile active status
      const updatedProfile1 = await prisma.smartProfile.findUnique({
        where: { id: profile1.id }
      });
      const updatedProfile2 = await prisma.smartProfile.findUnique({
        where: { id: profile2.id }
      });
      
      expect(updatedProfile1.isActive).toBe(false);
      expect(updatedProfile2.isActive).toBe(true);
    });
  });
});