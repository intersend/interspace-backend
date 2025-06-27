import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

describe('Flat Identity Model Basic Tests', () => {
  beforeAll(async () => {
    // Clean database
    await cleanDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  async function cleanDatabase() {
    // Clean in correct order due to foreign keys
    await prisma.auditLog.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.orbyTransaction.deleteMany();
    await prisma.orbyOperation.deleteMany();
    await prisma.bookmarkedApp.deleteMany();
    await prisma.folder.deleteMany();
    await prisma.tokenAllowance.deleteMany();
    await prisma.linkedAccount.deleteMany();
    await prisma.accountSession.deleteMany();
    await prisma.profileAccount.deleteMany();
    await prisma.identityLink.deleteMany();
    await prisma.account.deleteMany();
    await prisma.smartProfile.deleteMany();
    await prisma.blacklistedToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.deviceRegistration.deleteMany();
    await prisma.emailVerification.deleteMany();
    await prisma.user.deleteMany();
  }

  describe('Account Model Tests', () => {
    it('should create and retrieve an account', async () => {
      const account = await prisma.account.create({
        data: {
          type: 'email',
          identifier: 'test@example.com',
          verified: true,
          metadata: { source: 'test' }
        }
      });

      expect(account).toMatchObject({
        type: 'email',
        identifier: 'test@example.com',
        verified: true
      });

      // Verify we can find it
      const found = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'email',
            identifier: 'test@example.com'
          }
        }
      });

      expect(found?.id).toBe(account.id);
    });

    it('should create different types of accounts', async () => {
      const accounts = await Promise.all([
        prisma.account.create({
          data: {
            type: 'wallet',
            identifier: '0x1234567890abcdef',
            verified: true
          }
        }),
        prisma.account.create({
          data: {
            type: 'social',
            identifier: 'google_123',
            provider: 'google',
            verified: false
          }
        }),
        prisma.account.create({
          data: {
            type: 'guest',
            identifier: 'guest_abc123',
            verified: false
          }
        })
      ]);

      expect(accounts).toHaveLength(3);
      expect(accounts[0].type).toBe('wallet');
      expect(accounts[1].provider).toBe('google');
      expect(accounts[2].verified).toBe(false);
    });
  });

  describe('Identity Link Tests', () => {
    it('should link two accounts', async () => {
      const account1 = await prisma.account.create({
        data: {
          type: 'email',
          identifier: 'user@example.com',
          verified: true
        }
      });

      const account2 = await prisma.account.create({
        data: {
          type: 'wallet',
          identifier: '0xwallet123',
          verified: true
        }
      });

      const link = await prisma.identityLink.create({
        data: {
          accountAId: account1.id,
          accountBId: account2.id,
          linkType: 'direct',
          privacyMode: 'linked'
        }
      });

      expect(link).toMatchObject({
        accountAId: account1.id,
        accountBId: account2.id,
        linkType: 'direct',
        privacyMode: 'linked'
      });
    });

    it('should handle different privacy modes', async () => {
      const accounts = await Promise.all([
        prisma.account.create({
          data: { type: 'email', identifier: 'test1@example.com', verified: true }
        }),
        prisma.account.create({
          data: { type: 'email', identifier: 'test2@example.com', verified: true }
        }),
        prisma.account.create({
          data: { type: 'email', identifier: 'test3@example.com', verified: true }
        })
      ]);

      const links = await Promise.all([
        prisma.identityLink.create({
          data: {
            accountAId: accounts[0].id,
            accountBId: accounts[1].id,
            privacyMode: 'linked'
          }
        }),
        prisma.identityLink.create({
          data: {
            accountAId: accounts[1].id,
            accountBId: accounts[2].id,
            privacyMode: 'isolated'
          }
        })
      ]);

      expect(links[0].privacyMode).toBe('linked');
      expect(links[1].privacyMode).toBe('isolated');
    });
  });

  describe('Profile Account Association Tests', () => {
    it('should link account to profile', async () => {
      // Create user first (still required for profiles)
      const user = await prisma.user.create({
        data: {
          email: 'profile@example.com'
        }
      });

      const account = await prisma.account.create({
        data: {
          type: 'email',
          identifier: 'profile@example.com',
          verified: true
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

      const profileAccount = await prisma.profileAccount.create({
        data: {
          profileId: profile.id,
          accountId: account.id,
          isPrimary: true
        }
      });

      expect(profileAccount).toMatchObject({
        profileId: profile.id,
        accountId: account.id,
        isPrimary: true
      });
    });

    it('should allow multiple accounts per profile', async () => {
      const user = await prisma.user.create({
        data: { email: 'multi@example.com' }
      });

      const profile = await prisma.smartProfile.create({
        data: {
          name: 'Multi Account Profile',
          userId: user.id,
          sessionWalletAddress: '0xmulti123',
          isActive: true
        }
      });

      const accounts = await Promise.all([
        prisma.account.create({
          data: { type: 'email', identifier: 'multi@example.com', verified: true }
        }),
        prisma.account.create({
          data: { type: 'wallet', identifier: '0xmultiwallet', verified: true }
        }),
        prisma.account.create({
          data: { type: 'social', identifier: 'google_multi', provider: 'google', verified: true }
        })
      ]);

      const associations = await Promise.all(
        accounts.map((account, index) =>
          prisma.profileAccount.create({
            data: {
              profileId: profile.id,
              accountId: account.id,
              isPrimary: index === 0
            }
          })
        )
      );

      expect(associations).toHaveLength(3);
      expect(associations.filter(a => a.isPrimary)).toHaveLength(1);
    });
  });

  describe('Account Session Tests', () => {
    it('should create session for account', async () => {
      const account = await prisma.account.create({
        data: {
          type: 'email',
          identifier: 'session@example.com',
          verified: true
        }
      });

      const sessionId = uuidv4();
      const session = await prisma.accountSession.create({
        data: {
          accountId: account.id,
          sessionId,
          deviceId: 'test-device',
          privacyMode: 'linked',
          expiresAt: new Date(Date.now() + 3600000) // 1 hour
        }
      });

      expect(session).toMatchObject({
        accountId: account.id,
        sessionId,
        privacyMode: 'linked'
      });
    });

    it('should handle different privacy modes in sessions', async () => {
      const account = await prisma.account.create({
        data: {
          type: 'wallet',
          identifier: '0xprivacy123',
          verified: true
        }
      });

      const sessions = await Promise.all([
        prisma.accountSession.create({
          data: {
            accountId: account.id,
            sessionId: uuidv4(),
            privacyMode: 'linked',
            expiresAt: new Date(Date.now() + 3600000)
          }
        }),
        prisma.accountSession.create({
          data: {
            accountId: account.id,
            sessionId: uuidv4(),
            privacyMode: 'isolated',
            expiresAt: new Date(Date.now() + 3600000)
          }
        })
      ]);

      expect(sessions[0].privacyMode).toBe('linked');
      expect(sessions[1].privacyMode).toBe('isolated');
    });
  });

  describe('Email Verification Flow', () => {
    it('should create and verify email verification', async () => {
      const email = 'verify@example.com';
      const code = '123456';
      const hashedCode = await bcrypt.hash(code, 10);

      const verification = await prisma.emailVerification.create({
        data: {
          email,
          code: hashedCode,
          expiresAt: new Date(Date.now() + 600000), // 10 minutes
          attempts: 0
        }
      });

      expect(verification.email).toBe(email);

      // Verify the code
      const isValid = await bcrypt.compare(code, verification.code);
      expect(isValid).toBe(true);

      // Clean up
      await prisma.emailVerification.delete({
        where: { id: verification.id }
      });
    });
  });
});