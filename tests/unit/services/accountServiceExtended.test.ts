import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import accountService from '@/services/accountService';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    identityLink: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn()
    },
    profileAccount: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn()
    },
    smartProfile: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn()
    },
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    accountSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    $transaction: jest.fn()
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient)
  };
});

describe('AccountService Extended Tests', () => {
  let prisma;

  beforeEach(() => {
    prisma = new PrismaClient();
    jest.clearAllMocks();
  });

  describe('Account Creation Edge Cases', () => {
    it('should handle passkey account creation', async () => {
      const passkeyAccount = {
        id: 'acc_passkey',
        type: 'passkey',
        identifier: 'credential_123',
        provider: 'passkey',
        verified: true,
        metadata: { deviceName: 'iPhone 15' }
      };

      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(passkeyAccount);

      const result = await accountService.findOrCreateAccount({
        type: 'passkey',
        identifier: 'credential_123',
        provider: 'passkey',
        metadata: { deviceName: 'iPhone 15' }
      });

      expect(result).toEqual(passkeyAccount);
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          type: 'passkey',
          identifier: 'credential_123',
          provider: 'passkey',
          metadata: { deviceName: 'iPhone 15' },
          verified: false // Passkeys are not auto-verified like wallets
        }
      });
    });

    it('should merge metadata when account already exists', async () => {
      const existingAccount = {
        id: 'acc_existing',
        type: 'social',
        identifier: 'google_123',
        provider: 'google',
        metadata: { email: 'old@gmail.com', name: 'Old Name' }
      };

      prisma.account.findUnique.mockResolvedValue(existingAccount);

      const result = await accountService.findOrCreateAccount({
        type: 'social',
        identifier: 'google_123',
        provider: 'google',
        metadata: { email: 'new@gmail.com', picture: 'https://new.jpg' }
      });

      expect(result).toEqual(existingAccount);
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it('should handle guest account with device info', async () => {
      const guestAccount = {
        id: 'acc_guest',
        type: 'guest',
        identifier: 'guest_123_abc',
        verified: false,
        metadata: {
          deviceInfo: {
            deviceId: 'device_123',
            userAgent: 'Mozilla/5.0',
            ipAddress: '192.168.1.1'
          }
        }
      };

      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(guestAccount);

      const result = await accountService.findOrCreateAccount({
        type: 'guest',
        identifier: 'guest_123_abc',
        metadata: {
          deviceInfo: {
            deviceId: 'device_123',
            userAgent: 'Mozilla/5.0',
            ipAddress: '192.168.1.1'
          }
        }
      });

      expect(result).toEqual(guestAccount);
      expect(result.verified).toBe(false);
    });
  });

  describe('Identity Link Complex Scenarios', () => {
    it('should handle transitive identity links', async () => {
      const accountId = 'acc_center';
      
      // A-B linked, B-C linked, C-D partial
      const links = [
        {
          accountAId: accountId,
          accountBId: 'acc_b',
          privacyMode: 'linked',
          accountA: { id: accountId },
          accountB: { id: 'acc_b' }
        },
        {
          accountAId: 'acc_b',
          accountBId: 'acc_c',
          privacyMode: 'linked',
          accountA: { id: 'acc_b' },
          accountB: { id: 'acc_c' }
        },
        {
          accountAId: 'acc_c',
          accountBId: 'acc_d',
          privacyMode: 'partial',
          accountA: { id: 'acc_c' },
          accountB: { id: 'acc_d' }
        }
      ];

      prisma.identityLink.findMany.mockResolvedValue(links);

      const result = await accountService.getLinkedAccounts(accountId);

      // Should include all transitively linked accounts
      expect(result).toEqual(expect.arrayContaining([
        accountId, 'acc_b', 'acc_c', 'acc_d'
      ]));
    });

    it('should prevent circular identity links', async () => {
      const links = [
        {
          accountAId: 'acc_1',
          accountBId: 'acc_2',
          privacyMode: 'linked'
        },
        {
          accountAId: 'acc_2',
          accountBId: 'acc_3',
          privacyMode: 'linked'
        }
      ];

      prisma.identityLink.findMany.mockResolvedValue(links);
      prisma.identityLink.upsert.mockImplementation(async ({ create }) => {
        // Check for circular link
        if (create.accountAId === 'acc_1' && create.accountBId === 'acc_3') {
          throw new Error('Circular link detected');
        }
        return { ...create, id: 'link_new' };
      });

      await expect(
        accountService.linkAccounts('acc_3', 'acc_1')
      ).rejects.toThrow('Circular link detected');
    });

    it('should handle mixed privacy modes in identity graph', async () => {
      const accountId = 'acc_main';
      
      const links = [
        {
          accountAId: accountId,
          accountBId: 'acc_linked',
          privacyMode: 'linked',
          accountA: { id: accountId },
          accountB: { id: 'acc_linked' }
        },
        {
          accountAId: accountId,
          accountBId: 'acc_partial',
          privacyMode: 'partial',
          accountA: { id: accountId },
          accountB: { id: 'acc_partial' }
        },
        {
          accountAId: accountId,
          accountBId: 'acc_isolated',
          privacyMode: 'isolated',
          accountA: { id: accountId },
          accountB: { id: 'acc_isolated' }
        }
      ];

      prisma.identityLink.findMany.mockResolvedValue(
        links.filter(l => l.privacyMode !== 'isolated')
      );

      const result = await accountService.getLinkedAccounts(accountId);

      // Should exclude isolated accounts
      expect(result).toEqual(expect.arrayContaining([
        accountId, 'acc_linked', 'acc_partial'
      ]));
      expect(result).not.toContain('acc_isolated');
    });
  });

  describe('Profile Access Control', () => {
    it('should enforce profile access through identity links', async () => {
      const accountId = 'acc_requester';
      const linkedAccountId = 'acc_linked';
      const isolatedAccountId = 'acc_isolated';

      // Mock linked accounts (only linked account)
      jest.spyOn(accountService, 'getLinkedAccounts')
        .mockResolvedValue([accountId, linkedAccountId]);

      const profileAccounts = [
        {
          profile: {
            id: 'prof_accessible',
            name: 'Accessible Profile',
            linkedAccounts: [],
            folders: []
          },
          accountId: linkedAccountId
        },
        {
          profile: {
            id: 'prof_inaccessible',
            name: 'Inaccessible Profile',
            linkedAccounts: [],
            folders: []
          },
          accountId: isolatedAccountId
        }
      ];

      // Only return profiles for linked accounts
      prisma.profileAccount.findMany.mockResolvedValue([profileAccounts[0]]);

      const result = await accountService.getAccessibleProfiles(accountId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prof_accessible');
      expect(result.find(p => p.id === 'prof_inaccessible')).toBeUndefined();
    });

    it('should handle profiles shared across multiple accounts', async () => {
      const accountId = 'acc_main';
      const sharedProfile = {
        id: 'prof_shared',
        name: 'Shared Profile',
        linkedAccounts: [],
        folders: []
      };

      jest.spyOn(accountService, 'getLinkedAccounts')
        .mockResolvedValue([accountId, 'acc_2', 'acc_3']);

      const profileAccounts = [
        { profile: sharedProfile, accountId: accountId },
        { profile: sharedProfile, accountId: 'acc_2' },
        { profile: sharedProfile, accountId: 'acc_3' }
      ];

      prisma.profileAccount.findMany.mockResolvedValue(profileAccounts);

      const result = await accountService.getAccessibleProfiles(accountId);

      // Should deduplicate and return single profile
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('prof_shared');
    });
  });

  describe('Session Management', () => {
    it('should handle session creation with custom expiration', async () => {
      const accountId = 'acc_session';
      const customExpiration = 24 * 60 * 60 * 1000; // 24 hours

      const session = {
        id: 'sess_custom',
        accountId,
        sessionToken: uuidv4(),
        privacyMode: 'linked',
        expiresAt: new Date(Date.now() + customExpiration)
      };

      prisma.accountSession.create.mockResolvedValue(session);

      const result = await accountService.createSession(accountId, {
        deviceId: 'device_123',
        expiresIn: customExpiration
      });

      expect(result).toEqual(expect.objectContaining({
        accountId,
        privacyMode: 'linked'
      }));

      const createCall = prisma.accountSession.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt;
      const now = Date.now();
      
      // Verify expiration is approximately 24 hours from now
      expect(expiresAt.getTime()).toBeGreaterThan(now + customExpiration - 1000);
      expect(expiresAt.getTime()).toBeLessThan(now + customExpiration + 1000);
    });

    it('should handle session with isolated privacy mode', async () => {
      const session = {
        id: 'sess_isolated',
        accountId: 'acc_isolated',
        sessionToken: uuidv4(),
        privacyMode: 'isolated',
        deviceId: 'secure_device'
      };

      prisma.accountSession.create.mockResolvedValue(session);

      const result = await accountService.createSession('acc_isolated', {
        deviceId: 'secure_device',
        privacyMode: 'isolated',
        ipAddress: '10.0.0.1',
        userAgent: 'SecureBrowser/1.0'
      });

      expect(result.privacyMode).toBe('isolated');
      expect(prisma.accountSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          privacyMode: 'isolated',
          deviceId: 'secure_device'
        })
      });
    });
  });

  describe('Automatic Profile Creation', () => {
    it('should handle profile creation with pre-generated ID', async () => {
      const account = {
        id: 'acc_new',
        type: 'wallet',
        identifier: '0xwallet'
      };

      const sessionWallet = {
        address: '0xsession',
        isDevelopment: false
      };

      const preGeneratedId = uuidv4();

      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'usr_new',
        walletAddress: '0xwallet'
      });

      prisma.smartProfile.create.mockResolvedValue({
        id: preGeneratedId,
        name: 'My Smartprofile',
        userId: 'usr_new',
        sessionWalletAddress: '0xsession'
      });

      prisma.profileAccount.create.mockResolvedValue({});

      const result = await accountService.createAutomaticProfile(
        account,
        sessionWallet,
        preGeneratedId
      );

      expect(result.id).toBe(preGeneratedId);
      expect(prisma.smartProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: preGeneratedId
        })
      });
    });

    it('should handle profile creation failure and cleanup', async () => {
      const account = {
        id: 'acc_fail',
        type: 'email',
        identifier: 'fail@example.com'
      };

      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'usr_fail',
        email: 'fail@example.com'
      });

      // Simulate profile creation failure
      prisma.smartProfile.create.mockRejectedValue(
        new Error('Database connection lost')
      );

      await expect(
        accountService.createAutomaticProfile(account)
      ).rejects.toThrow('Database connection lost');
    });

    it('should associate profile with orby cluster accounts', async () => {
      const account = {
        id: 'acc_orby',
        type: 'wallet',
        identifier: '0xorby',
        metadata: { walletType: 'orby' }
      };

      const sessionWallet = {
        address: '0xsessionorby',
        isDevelopment: false
      };

      const user = {
        id: 'usr_orby',
        walletAddress: '0xorby'
      };

      const profile = {
        id: 'prof_orby',
        name: 'My Smartprofile',
        userId: user.id,
        sessionWalletAddress: sessionWallet.address,
        isActive: true
      };

      prisma.user.findFirst.mockResolvedValue(user);
      prisma.smartProfile.create.mockResolvedValue(profile);
      prisma.profileAccount.create.mockResolvedValue({});

      const result = await accountService.createAutomaticProfile(
        account,
        sessionWallet
      );

      expect(result).toEqual(profile);
      
      // Verify profile account link was created with primary flag
      expect(prisma.profileAccount.create).toHaveBeenCalledWith({
        data: {
          profileId: profile.id,
          accountId: account.id,
          isPrimary: true
        }
      });
    });
  });

  describe('Account Metadata Management', () => {
    it('should preserve existing metadata when updating', async () => {
      const accountId = 'acc_meta';
      const existingMetadata = {
        walletType: 'metamask',
        chainId: 1,
        lastSeen: '2024-01-01'
      };

      const newMetadata = {
        chainId: 137, // Update
        browser: 'Chrome', // Add new
        // lastSeen is not provided, should be preserved
      };

      prisma.account.findUnique.mockResolvedValue({
        id: accountId,
        metadata: existingMetadata
      });

      prisma.account.update.mockResolvedValue({
        id: accountId,
        metadata: {
          walletType: 'metamask',
          chainId: 137,
          lastSeen: '2024-01-01',
          browser: 'Chrome'
        }
      });

      const result = await accountService.updateAccountMetadata(
        accountId,
        newMetadata
      );

      expect(result.metadata).toEqual({
        walletType: 'metamask',
        chainId: 137,
        lastSeen: '2024-01-01',
        browser: 'Chrome'
      });
    });

    it('should handle null metadata gracefully', async () => {
      const accountId = 'acc_null_meta';

      prisma.account.findUnique.mockResolvedValue({
        id: accountId,
        metadata: null
      });

      prisma.account.update.mockResolvedValue({
        id: accountId,
        metadata: { newField: 'value' }
      });

      const result = await accountService.updateAccountMetadata(
        accountId,
        { newField: 'value' }
      );

      expect(result.metadata).toEqual({ newField: 'value' });
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: {
          metadata: { newField: 'value' }
        }
      });
    });
  });

  describe('Profile Account Linking', () => {
    it('should handle duplicate profile-account links gracefully', async () => {
      const existingLink = {
        profileId: 'prof_123',
        accountId: 'acc_123',
        isPrimary: false,
        permissions: { role: 'owner' }
      };

      prisma.profileAccount.findUnique.mockResolvedValue(existingLink);

      const result = await accountService.linkProfileToAccount(
        'acc_123',
        'prof_123'
      );

      expect(result).toEqual(existingLink);
      expect(prisma.profileAccount.create).not.toHaveBeenCalled();
    });

    it('should create new profile-account link with permissions', async () => {
      const newLink = {
        profileId: 'prof_new',
        accountId: 'acc_new',
        isPrimary: false,
        permissions: { role: 'owner' }
      };

      prisma.profileAccount.findUnique.mockResolvedValue(null);
      prisma.profileAccount.create.mockResolvedValue(newLink);

      const result = await accountService.linkProfileToAccount(
        'acc_new',
        'prof_new'
      );

      expect(result).toEqual(newLink);
      expect(prisma.profileAccount.create).toHaveBeenCalledWith({
        data: {
          profileId: 'prof_new',
          accountId: 'acc_new',
          isPrimary: false,
          permissions: { role: 'owner' }
        }
      });
    });
  });

  describe('Account Verification', () => {
    it('should verify account and update timestamp', async () => {
      const accountId = 'acc_verify';

      prisma.account.update.mockResolvedValue({
        id: accountId,
        verified: true,
        updatedAt: new Date()
      });

      await accountService.verifyAccount(accountId);

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { verified: true }
      });
    });

    it('should handle verification of already verified account', async () => {
      const accountId = 'acc_already_verified';

      prisma.account.update.mockResolvedValue({
        id: accountId,
        verified: true
      });

      await accountService.verifyAccount(accountId);

      // Should still call update (idempotent operation)
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { verified: true }
      });
    });
  });

  describe('Profile Session Wallet Updates', () => {
    it('should update profile session wallet address', async () => {
      const profileId = 'prof_wallet_update';
      const newAddress = '0xnewMPCaddress';

      prisma.smartProfile.update.mockResolvedValue({
        id: profileId,
        sessionWalletAddress: newAddress,
        developmentMode: false
      });

      const result = await accountService.updateProfileSessionWallet(
        profileId,
        newAddress
      );

      expect(result.sessionWalletAddress).toBe(newAddress);
      expect(prisma.smartProfile.update).toHaveBeenCalledWith({
        where: { id: profileId },
        data: { sessionWalletAddress: newAddress }
      });
    });

    it('should handle MPC wallet placeholder update', async () => {
      const profileId = 'prof_mpc';
      const placeholderAddress = '0x' + '0'.repeat(40);
      const actualMPCAddress = '0xactualMPC123';

      // First update with placeholder
      prisma.smartProfile.update.mockResolvedValueOnce({
        id: profileId,
        sessionWalletAddress: placeholderAddress
      });

      await accountService.updateProfileSessionWallet(
        profileId,
        placeholderAddress
      );

      // Later update with actual MPC address
      prisma.smartProfile.update.mockResolvedValueOnce({
        id: profileId,
        sessionWalletAddress: actualMPCAddress
      });

      const result = await accountService.updateProfileSessionWallet(
        profileId,
        actualMPCAddress
      );

      expect(result.sessionWalletAddress).toBe(actualMPCAddress);
    });
  });
});