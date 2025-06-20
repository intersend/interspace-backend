const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const accountService = require('../../../src/services/accountService');
const { PrismaClient } = require('@prisma/client');

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    account: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn()
    },
    identityLink: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn()
    },
    profileAccount: {
      findMany: jest.fn(),
      create: jest.fn()
    },
    smartProfile: {
      create: jest.fn()
    },
    user: {
      findFirst: jest.fn(),
      create: jest.fn()
    },
    accountSession: {
      create: jest.fn()
    }
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient)
  };
});

describe('AccountService', () => {
  let prisma;

  beforeEach(() => {
    prisma = new PrismaClient();
    jest.clearAllMocks();
  });

  describe('findOrCreateAccount', () => {
    it('should find existing account', async () => {
      const existingAccount = {
        id: 'acc_123',
        type: 'email',
        identifier: 'test@example.com',
        verified: true
      };

      prisma.account.findUnique.mockResolvedValue(existingAccount);

      const result = await accountService.findOrCreateAccount({
        type: 'email',
        identifier: 'TEST@EXAMPLE.COM' // Test case normalization
      });

      expect(result).toEqual(existingAccount);
      expect(prisma.account.findUnique).toHaveBeenCalledWith({
        where: {
          type_identifier: {
            type: 'email',
            identifier: 'test@example.com'
          }
        }
      });
    });

    it('should create new account if not found', async () => {
      const newAccount = {
        id: 'acc_456',
        type: 'wallet',
        identifier: '0x1234567890abcdef',
        verified: true
      };

      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(newAccount);

      const result = await accountService.findOrCreateAccount({
        type: 'wallet',
        identifier: '0x1234567890ABCDEF', // Test case normalization
        metadata: { walletType: 'metamask' }
      });

      expect(result).toEqual(newAccount);
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          type: 'wallet',
          identifier: '0x1234567890abcdef',
          provider: null,
          metadata: { walletType: 'metamask' },
          verified: true // Wallets are auto-verified
        }
      });
    });

    it('should handle social accounts with provider', async () => {
      const socialAccount = {
        id: 'acc_789',
        type: 'social',
        identifier: 'google_12345',
        provider: 'google',
        verified: true
      };

      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(socialAccount);

      const result = await accountService.findOrCreateAccount({
        type: 'social',
        identifier: 'google_12345',
        provider: 'google',
        metadata: { email: 'user@gmail.com' }
      });

      expect(result).toEqual(socialAccount);
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          type: 'social',
          identifier: 'google_12345',
          provider: 'google',
          metadata: { email: 'user@gmail.com' },
          verified: false
        }
      });
    });
  });

  describe('getLinkedAccounts', () => {
    it('should return all linked accounts', async () => {
      const accountId = 'acc_123';
      const links = [
        {
          accountAId: accountId,
          accountBId: 'acc_456',
          privacyMode: 'linked'
        },
        {
          accountAId: 'acc_789',
          accountBId: accountId,
          privacyMode: 'partial'
        }
      ];

      prisma.identityLink.findMany.mockResolvedValue(links);

      const result = await accountService.getLinkedAccounts(accountId);

      expect(result).toEqual(['acc_123', 'acc_456', 'acc_789']);
      expect(prisma.identityLink.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { accountAId: accountId },
            { accountBId: accountId }
          ],
          privacyMode: { not: 'isolated' }
        },
        include: {
          accountA: true,
          accountB: true
        }
      });
    });

    it('should exclude isolated accounts', async () => {
      const accountId = 'acc_123';
      const links = [
        {
          accountAId: accountId,
          accountBId: 'acc_456',
          privacyMode: 'linked'
        },
        {
          accountAId: accountId,
          accountBId: 'acc_789',
          privacyMode: 'isolated' // Should be excluded
        }
      ];

      prisma.identityLink.findMany.mockResolvedValue([links[0]]); // Only non-isolated

      const result = await accountService.getLinkedAccounts(accountId);

      expect(result).toEqual(['acc_123', 'acc_456']);
    });
  });

  describe('linkAccounts', () => {
    it('should create new link between accounts', async () => {
      const link = {
        id: 'link_123',
        accountAId: 'acc_123',
        accountBId: 'acc_456',
        linkType: 'direct',
        privacyMode: 'linked'
      };

      prisma.identityLink.upsert.mockResolvedValue(link);

      const result = await accountService.linkAccounts('acc_456', 'acc_123');

      expect(result).toEqual(link);
      expect(prisma.identityLink.upsert).toHaveBeenCalledWith({
        where: {
          accountAId_accountBId: {
            accountAId: 'acc_123', // Sorted
            accountBId: 'acc_456'
          }
        },
        update: {
          linkType: 'direct',
          privacyMode: 'linked',
          updatedAt: expect.any(Date)
        },
        create: {
          accountAId: 'acc_123',
          accountBId: 'acc_456',
          linkType: 'direct',
          privacyMode: 'linked'
        }
      });
    });

    it('should handle custom privacy modes', async () => {
      const link = {
        id: 'link_123',
        accountAId: 'acc_123',
        accountBId: 'acc_456',
        linkType: 'inferred',
        privacyMode: 'partial'
      };

      prisma.identityLink.upsert.mockResolvedValue(link);

      const result = await accountService.linkAccounts(
        'acc_123',
        'acc_456',
        'inferred',
        'partial'
      );

      expect(result).toEqual(link);
      expect(prisma.identityLink.upsert).toHaveBeenCalledWith({
        where: {
          accountAId_accountBId: {
            accountAId: 'acc_123',
            accountBId: 'acc_456'
          }
        },
        update: expect.objectContaining({
          linkType: 'inferred',
          privacyMode: 'partial'
        }),
        create: expect.objectContaining({
          linkType: 'inferred',
          privacyMode: 'partial'
        })
      });
    });
  });

  describe('getAccessibleProfiles', () => {
    it('should return profiles from all linked accounts', async () => {
      const accountId = 'acc_123';
      const linkedAccountIds = ['acc_123', 'acc_456'];
      const profileAccounts = [
        {
          profile: {
            id: 'prof_1',
            name: 'Profile 1',
            linkedAccounts: []
          }
        },
        {
          profile: {
            id: 'prof_2',
            name: 'Profile 2',
            linkedAccounts: []
          }
        }
      ];

      // Mock the internal method
      jest.spyOn(accountService, 'getLinkedAccounts').mockResolvedValue(linkedAccountIds);
      prisma.profileAccount.findMany.mockResolvedValue(profileAccounts);

      const result = await accountService.getAccessibleProfiles(accountId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('prof_1');
      expect(result[1].id).toBe('prof_2');
    });

    it('should deduplicate profiles', async () => {
      const accountId = 'acc_123';
      const profileAccounts = [
        {
          profile: {
            id: 'prof_1',
            name: 'Profile 1'
          }
        },
        {
          profile: {
            id: 'prof_1', // Duplicate
            name: 'Profile 1'
          }
        }
      ];

      jest.spyOn(accountService, 'getLinkedAccounts').mockResolvedValue(['acc_123']);
      prisma.profileAccount.findMany.mockResolvedValue(profileAccounts);

      const result = await accountService.getAccessibleProfiles(accountId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prof_1');
    });
  });

  describe('createAutomaticProfile', () => {
    it('should create profile for new user', async () => {
      const account = {
        id: 'acc_123',
        type: 'email',
        identifier: 'test@example.com'
      };

      const sessionWallet = {
        address: '0xsession123',
        isDevelopment: false
      };

      const user = {
        id: 'usr_123',
        email: 'test@example.com'
      };

      const profile = {
        id: 'prof_123',
        name: 'My Smartprofile',
        userId: 'usr_123',
        sessionWalletAddress: '0xsession123',
        isActive: true
      };

      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);
      prisma.smartProfile.create.mockResolvedValue(profile);
      prisma.profileAccount.create.mockResolvedValue({});

      const result = await accountService.createAutomaticProfile(account, sessionWallet);

      expect(result).toEqual(profile);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          id: expect.any(String),
          email: 'test@example.com',
          walletAddress: null,
          isGuest: false,
          authStrategies: 'email'
        }
      });
      expect(prisma.smartProfile.create).toHaveBeenCalledWith({
        data: {
          name: 'My Smartprofile',
          userId: 'usr_123',
          sessionWalletAddress: '0xsession123',
          isActive: true,
          isDevelopmentWallet: false,
          createdByAccountId: 'acc_123'
        }
      });
      expect(prisma.profileAccount.create).toHaveBeenCalledWith({
        data: {
          profileId: 'prof_123',
          accountId: 'acc_123',
          isPrimary: true
        }
      });
    });

    it('should use existing user if found', async () => {
      const account = {
        id: 'acc_123',
        type: 'wallet',
        identifier: '0xwallet123'
      };

      const existingUser = {
        id: 'usr_existing',
        walletAddress: '0xwallet123'
      };

      const sessionWallet = {
        address: '0xsession456'
      };

      prisma.user.findFirst.mockResolvedValue(existingUser);
      prisma.smartProfile.create.mockResolvedValue({
        id: 'prof_new',
        userId: 'usr_existing'
      });
      prisma.profileAccount.create.mockResolvedValue({});

      const result = await accountService.createAutomaticProfile(account, sessionWallet);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.smartProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'usr_existing'
        })
      });
    });
  });

  describe('createSession', () => {
    it('should create new session with defaults', async () => {
      const session = {
        id: 'sess_123',
        accountId: 'acc_123',
        sessionToken: expect.any(String),
        privacyMode: 'linked',
        expiresAt: expect.any(Date)
      };

      prisma.accountSession.create.mockResolvedValue(session);

      const result = await accountService.createSession('acc_123', {
        deviceId: 'device_123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });

      expect(result).toEqual(session);
      expect(prisma.accountSession.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc_123',
          sessionToken: expect.any(String),
          deviceId: 'device_123',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          privacyMode: 'linked',
          expiresAt: expect.any(Date)
        }
      });
    });

    it('should handle custom privacy mode and expiration', async () => {
      prisma.accountSession.create.mockResolvedValue({});

      await accountService.createSession('acc_123', {
        privacyMode: 'isolated',
        expiresIn: 3600000 // 1 hour
      });

      expect(prisma.accountSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          privacyMode: 'isolated'
        })
      });
    });
  });

  describe('setLinkPrivacyMode', () => {
    it('should update privacy mode for link', async () => {
      const updatedLink = {
        id: 'link_123',
        accountAId: 'acc_123',
        accountBId: 'acc_456',
        privacyMode: 'isolated'
      };

      prisma.identityLink.update.mockResolvedValue(updatedLink);

      const result = await accountService.setLinkPrivacyMode(
        'acc_456',
        'acc_123',
        'isolated'
      );

      expect(result).toEqual(updatedLink);
      expect(prisma.identityLink.update).toHaveBeenCalledWith({
        where: {
          accountAId_accountBId: {
            accountAId: 'acc_123', // Sorted
            accountBId: 'acc_456'
          }
        },
        data: { privacyMode: 'isolated' }
      });
    });
  });

  describe('updateAccountMetadata', () => {
    it('should merge metadata correctly', async () => {
      const existingAccount = {
        id: 'acc_123',
        metadata: { foo: 'bar', baz: 'qux' }
      };

      const updatedAccount = {
        id: 'acc_123',
        metadata: { foo: 'updated', new: 'value', baz: 'qux' }
      };

      prisma.account.findUnique.mockResolvedValue(existingAccount);
      prisma.account.update.mockResolvedValue(updatedAccount);

      const result = await accountService.updateAccountMetadata('acc_123', {
        foo: 'updated',
        new: 'value'
      });

      expect(result).toEqual(updatedAccount);
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'acc_123' },
        data: {
          metadata: {
            foo: 'updated',
            baz: 'qux',
            new: 'value'
          }
        }
      });
    });
  });
});