const { describe, it, expect, beforeEach, jest } = require('@jest/globals');
const accountLinkingService = require('@/services/accountLinkingService');
const { prisma } = require('@/utils/database');
const { orbyService } = require('@/services/orbyService');
const { logger } = require('@/utils/logger');

// Mock dependencies
jest.mock('@/utils/database');
jest.mock('@/services/orbyService');
jest.mock('@/utils/logger');

describe('AccountLinkingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('autoLinkAccountToProfile', () => {
    it('should automatically link wallet account to profile', async () => {
      const account = {
        id: 'acc_123',
        type: 'wallet',
        identifier: '0x1234567890abcdef1234567890abcdef12345678',
        metadata: {
          walletType: 'metamask',
          chainId: 1
        }
      };

      const profile = {
        id: 'prof_123',
        userId: 'usr_123',
        name: 'My Profile'
      };

      const mockTx = {
        linkedAccount: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({
            id: 'linked_123',
            profileId: profile.id,
            address: account.identifier.toLowerCase(),
            isPrimary: true
          })
        },
        auditLog: {
          create: jest.fn()
        }
      };

      await accountLinkingService.autoLinkAccountToProfile(account, profile, mockTx);

      // Verify linked account was created
      expect(mockTx.linkedAccount.create).toHaveBeenCalledWith({
        data: {
          userId: profile.userId,
          profileId: profile.id,
          address: account.identifier.toLowerCase(),
          authStrategy: 'wallet',
          walletType: 'metamask',
          customName: null,
          isPrimary: true,
          isActive: true,
          chainId: 1,
          metadata: JSON.stringify(account.metadata)
        }
      });

      // Verify Orby cluster update was called
      expect(orbyService.updateAccountCluster).toHaveBeenCalledWith(profile.id, mockTx);

      // Verify audit log was created
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'WALLET_AUTO_LINKED'
        })
      });
    });

    it('should not link non-wallet accounts', async () => {
      const account = {
        id: 'acc_123',
        type: 'email',
        identifier: 'test@example.com'
      };

      const profile = {
        id: 'prof_123',
        userId: 'usr_123'
      };

      const mockTx = {
        linkedAccount: {
          create: jest.fn()
        }
      };

      await accountLinkingService.autoLinkAccountToProfile(account, profile, mockTx);

      // Verify no linked account was created for email
      expect(mockTx.linkedAccount.create).not.toHaveBeenCalled();
    });

    it('should link social accounts with wallet addresses', async () => {
      const account = {
        id: 'acc_123',
        type: 'social',
        identifier: 'telegram_user_123',
        provider: 'telegram',
        metadata: {
          walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12'
        }
      };

      const profile = {
        id: 'prof_123',
        userId: 'usr_123'
      };

      const mockTx = {
        linkedAccount: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({
            id: 'linked_123',
            profileId: profile.id,
            address: account.metadata.walletAddress.toLowerCase()
          })
        },
        auditLog: {
          create: jest.fn()
        }
      };

      await accountLinkingService.autoLinkAccountToProfile(account, profile, mockTx);

      // Verify social wallet was linked
      expect(mockTx.linkedAccount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: account.metadata.walletAddress.toLowerCase(),
          authStrategy: 'telegram',
          walletType: 'social'
        })
      });
    });

    it('should not duplicate existing links', async () => {
      const account = {
        id: 'acc_123',
        type: 'wallet',
        identifier: '0x1234567890abcdef1234567890abcdef12345678'
      };

      const profile = {
        id: 'prof_123',
        userId: 'usr_123'
      };

      const mockTx = {
        linkedAccount: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'existing_link',
            address: account.identifier.toLowerCase()
          }),
          create: jest.fn()
        }
      };

      await accountLinkingService.autoLinkAccountToProfile(account, profile, mockTx);

      // Verify no new linked account was created
      expect(mockTx.linkedAccount.create).not.toHaveBeenCalled();
    });
  });
});