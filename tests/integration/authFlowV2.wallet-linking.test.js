const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('@/index').default;
const { siweService } = require('@/services/siweService');
const sessionWalletService = require('@/services/sessionWalletService');

const prisma = new PrismaClient();

describe('V2 Wallet Auto-Linking Tests', () => {
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

  describe('Existing User Wallet Auto-Linking', () => {
    it('should auto-link wallet for existing user without LinkedAccount', async () => {
      // 1. Create an existing user with email account and profile
      const existingUser = await prisma.user.create({
        data: {
          email: 'existing@example.com',
          emailVerified: true,
          authStrategies: 'email'
        }
      });

      const emailAccount = await prisma.account.create({
        data: {
          type: 'email',
          identifier: 'existing@example.com',
          verified: true
        }
      });

      const existingProfile = await prisma.smartProfile.create({
        data: {
          name: 'Existing Profile',
          userId: existingUser.id,
          sessionWalletAddress: '0xexisting123',
          isActive: true
        }
      });

      await prisma.profileAccount.create({
        data: {
          profileId: existingProfile.id,
          accountId: emailAccount.id,
          isPrimary: true
        }
      });

      // Verify no LinkedAccount exists yet
      let linkedAccountCount = await prisma.linkedAccount.count({
        where: { profileId: existingProfile.id }
      });
      expect(linkedAccountCount).toBe(0);

      // 2. Now authenticate with a wallet
      const walletAddress = '0x9876543210abcdef9876543210abcdef98765432';
      
      // Mock wallet signature verification
      jest.spyOn(siweService, 'verifyMessage')
        .mockResolvedValueOnce({
          valid: true,
          address: walletAddress
        });

      // For existing users, the auth flow should use the existing session wallet
      // No need to mock anything for session wallet as it already exists

      const response = await request(server)
        .post('/api/v2/auth/authenticate')
        .send({
          strategy: 'wallet',
          walletAddress,
          signature: '0xvalidsignature',
          message: 'Sign this message',
          walletType: 'metamask',
          chainId: 1
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        account: {
          strategy: 'wallet',
          identifier: walletAddress.toLowerCase()
        },
        profiles: expect.arrayContaining([
          expect.objectContaining({
            id: existingProfile.id,
            displayName: 'Existing Profile',
            linkedAccountsCount: 1 // Should now show 1!
          })
        ]),
        isNewUser: false // This is an existing user
      });

      // 3. Verify wallet account was created
      const walletAccount = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'wallet',
            identifier: walletAddress.toLowerCase()
          }
        }
      });
      expect(walletAccount).toBeTruthy();

      // 4. Verify ProfileAccount link was created
      const profileAccountLink = await prisma.profileAccount.findUnique({
        where: {
          profileId_accountId: {
            profileId: existingProfile.id,
            accountId: walletAccount.id
          }
        }
      });
      expect(profileAccountLink).toBeTruthy();

      // 5. Most importantly: Verify LinkedAccount was auto-created
      const linkedAccount = await prisma.linkedAccount.findFirst({
        where: {
          profileId: existingProfile.id,
          address: walletAddress.toLowerCase()
        }
      });
      expect(linkedAccount).toBeTruthy();
      expect(linkedAccount.authStrategy).toBe('wallet');
      expect(linkedAccount.walletType).toBe('metamask');
      expect(linkedAccount.isActive).toBe(true);
      expect(linkedAccount.chainId).toBe(1);
    });

    it('should not duplicate LinkedAccount if already exists', async () => {
      // 1. Create user with profile and existing LinkedAccount
      const user = await prisma.user.create({
        data: {
          walletAddress: '0xtest123',
          authStrategies: 'wallet'
        }
      });

      const walletAccount = await prisma.account.create({
        data: {
          type: 'wallet',
          identifier: '0xtest123',
          verified: true,
          metadata: { walletType: 'metamask' }
        }
      });

      const profile = await prisma.smartProfile.create({
        data: {
          name: 'Test Profile',
          userId: user.id,
          sessionWalletAddress: '0xsession123',
          isActive: true
        }
      });

      await prisma.profileAccount.create({
        data: {
          profileId: profile.id,
          accountId: walletAccount.id,
          isPrimary: true
        }
      });

      // Create existing LinkedAccount
      await prisma.linkedAccount.create({
        data: {
          userId: user.id,
          profileId: profile.id,
          address: '0xtest123',
          authStrategy: 'wallet',
          walletType: 'metamask',
          isPrimary: true,
          isActive: true,
          chainId: 1
        }
      });

      // 2. Authenticate again with same wallet
      jest.spyOn(siweService, 'verifyMessage')
        .mockResolvedValueOnce({
          valid: true,
          address: '0xtest123'
        });

      jest.spyOn(sessionWalletService, 'getSessionWallet')
        .mockResolvedValueOnce({
          address: profile.sessionWalletAddress,
          isDevelopment: true
        });

      const response = await request(server)
        .post('/api/v2/auth/authenticate')
        .send({
          strategy: 'wallet',
          walletAddress: '0xtest123',
          signature: '0xvalidsignature',
          message: 'Sign this message'
        })
        .expect(200);

      expect(response.body.profiles[0].linkedAccountsCount).toBe(1);

      // 3. Verify only one LinkedAccount exists
      const linkedAccountCount = await prisma.linkedAccount.count({
        where: {
          profileId: profile.id,
          address: '0xtest123'
        }
      });
      expect(linkedAccountCount).toBe(1); // Should not duplicate
    });
  });

  describe('New User Wallet Linking', () => {
    it('should create profile with auto-linked wallet for new user', async () => {
      const walletAddress = '0xnewuser1234567890abcdef1234567890abcdef';
      
      jest.spyOn(siweService, 'verifyMessage')
        .mockResolvedValueOnce({
          valid: true,
          address: walletAddress
        });

      jest.spyOn(sessionWalletService, 'createSessionWallet')
        .mockResolvedValueOnce({
          address: '0xnewsession123',
          isDevelopment: true
        });

      const response = await request(server)
        .post('/api/v2/auth/authenticate')
        .send({
          strategy: 'wallet',
          walletAddress,
          signature: '0xvalidsignature',
          message: 'Sign this message',
          walletType: 'rainbow',
          chainId: 137 // Polygon
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        isNewUser: true,
        profiles: expect.arrayContaining([
          expect.objectContaining({
            displayName: 'My Smartprofile',
            linkedAccountsCount: 1
          })
        ])
      });

      // Verify LinkedAccount was created with correct chain
      const profile = response.body.profiles[0];
      const linkedAccount = await prisma.linkedAccount.findFirst({
        where: {
          profileId: profile.id,
          address: walletAddress.toLowerCase()
        }
      });
      expect(linkedAccount).toBeTruthy();
      expect(linkedAccount.chainId).toBe(137); // Polygon
      expect(linkedAccount.walletType).toBe('rainbow');
    });
  });

  describe('Orby Cluster Updates', () => {
    it('should trigger Orby cluster update after wallet linking', async () => {
      const orbyService = require('@/services/orbyService').orbyService;
      const updateClusterSpy = jest.spyOn(orbyService, 'updateAccountCluster')
        .mockResolvedValue(undefined);

      const walletAddress = '0xorbytest1234567890abcdef1234567890abcdef';
      
      jest.spyOn(siweService, 'verifyMessage')
        .mockResolvedValueOnce({
          valid: true,
          address: walletAddress
        });

      jest.spyOn(sessionWalletService, 'createSessionWallet')
        .mockResolvedValueOnce({
          address: '0xorbysession123',
          isDevelopment: true
        });

      await request(server)
        .post('/api/v2/auth/authenticate')
        .send({
          strategy: 'wallet',
          walletAddress,
          signature: '0xvalidsignature',
          message: 'Sign this message'
        })
        .expect(200);

      // Verify Orby cluster update was called
      expect(updateClusterSpy).toHaveBeenCalled();
      expect(updateClusterSpy).toHaveBeenCalledWith(
        expect.any(String), // profile ID
        expect.anything() // transaction context
      );
    });
  });
});