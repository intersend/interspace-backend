const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const authControllerV2 = require('../../../src/controllers/authControllerV2');
const accountService = require('../../../src/services/accountService');
const socialAuthService = require('../../../src/services/socialAuthService');
const sessionWalletService = require('../../../src/services/sessionWalletService');
const { generateTokens } = require('../../../src/utils/tokenUtils');

// Mock dependencies
jest.mock('../../../src/services/accountService');
jest.mock('../../../src/services/socialAuthService');
jest.mock('../../../src/services/sessionWalletService');
jest.mock('../../../src/utils/tokenUtils');
jest.mock('../../../src/services/auditService', () => ({
  logAuthentication: jest.fn()
}));

describe('AuthControllerV2', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
      account: null
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticateV2', () => {
    it('should authenticate new user with wallet', async () => {
      req.body = {
        strategy: 'wallet',
        walletAddress: '0x1234567890abcdef',
        signature: '0xsignature',
        message: 'Sign this message',
        walletType: 'metamask',
        deviceId: 'device_123'
      };

      const account = {
        id: 'acc_123',
        type: 'wallet',
        identifier: '0x1234567890abcdef',
        verified: true
      };

      const authResult = {
        user: { id: 'usr_123', isGuest: false },
        socialProfile: null
      };

      const sessionWallet = {
        address: '0xsession123',
        isDevelopment: false
      };

      const profile = {
        id: 'prof_123',
        name: 'My Smartprofile',
        sessionWalletAddress: '0xsession123',
        isActive: true
      };

      const session = {
        id: 'sess_123',
        sessionToken: 'session_token_123',
        privacyMode: 'linked'
      };

      const tokens = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresIn: 900
      };

      // Mock the service calls
      socialAuthService.authenticateWithWallet.mockResolvedValue(authResult);
      accountService.findOrCreateAccount.mockResolvedValue(account);
      accountService.verifyAccount.mockResolvedValue();
      accountService.getAccessibleProfiles.mockResolvedValue([]);
      sessionWalletService.createSessionWallet.mockResolvedValue(sessionWallet);
      accountService.createAutomaticProfile.mockResolvedValue(profile);
      accountService.createSession.mockResolvedValue(session);
      generateTokens.mockResolvedValue(tokens);

      await authControllerV2.authenticateV2(req, res, next);

      expect(socialAuthService.authenticateWithWallet).toHaveBeenCalledWith(
        '0x1234567890abcdef',
        '0xsignature',
        'Sign this message',
        'metamask'
      );

      expect(accountService.findOrCreateAccount).toHaveBeenCalledWith({
        type: 'wallet',
        identifier: '0x1234567890abcdef',
        metadata: {
          walletType: 'metamask',
          chainId: 1
        }
      });

      expect(accountService.verifyAccount).toHaveBeenCalledWith('acc_123');

      expect(accountService.createAutomaticProfile).toHaveBeenCalledWith(
        account,
        sessionWallet
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        account: {
          id: 'acc_123',
          type: 'wallet',
          identifier: '0x1234567890abcdef',
          verified: true
        },
        user: {
          id: 'usr_123',
          email: undefined,
          isGuest: false
        },
        profiles: [{
          id: 'prof_123',
          name: 'My Smartprofile',
          isActive: true,
          sessionWalletAddress: '0xsession123',
          linkedAccountsCount: 0
        }],
        activeProfile: {
          id: 'prof_123',
          name: 'My Smartprofile',
          sessionWalletAddress: '0xsession123'
        },
        tokens,
        isNewUser: true,
        sessionId: 'sess_123',
        privacyMode: 'linked'
      });
    });

    it('should authenticate existing user with email', async () => {
      req.body = {
        strategy: 'email',
        email: 'test@example.com',
        verificationCode: '123456'
      };

      const account = {
        id: 'acc_456',
        type: 'email',
        identifier: 'test@example.com',
        verified: true
      };

      const authResult = {
        user: { id: 'usr_456', email: 'test@example.com', isGuest: false }
      };

      const existingProfiles = [
        {
          id: 'prof_456',
          name: 'Trading Profile',
          isActive: true,
          sessionWalletAddress: '0xsession456',
          linkedAccounts: []
        },
        {
          id: 'prof_789',
          name: 'Gaming Profile',
          isActive: false,
          sessionWalletAddress: '0xsession789',
          linkedAccounts: []
        }
      ];

      const session = {
        id: 'sess_456',
        sessionToken: 'session_token_456',
        privacyMode: 'linked'
      };

      const tokens = {
        accessToken: 'access_token_2',
        refreshToken: 'refresh_token_2',
        expiresIn: 900
      };

      socialAuthService.authenticateWithEmail.mockResolvedValue(authResult);
      accountService.findOrCreateAccount.mockResolvedValue(account);
      accountService.getAccessibleProfiles.mockResolvedValue(existingProfiles);
      accountService.createSession.mockResolvedValue(session);
      generateTokens.mockResolvedValue(tokens);

      await authControllerV2.authenticateV2(req, res, next);

      expect(socialAuthService.authenticateWithEmail).toHaveBeenCalledWith(
        'test@example.com',
        '123456'
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        account: {
          id: 'acc_456',
          type: 'email',
          identifier: 'test@example.com',
          verified: true
        },
        user: {
          id: 'usr_456',
          email: 'test@example.com',
          isGuest: false
        },
        profiles: [
          {
            id: 'prof_456',
            name: 'Trading Profile',
            isActive: true,
            sessionWalletAddress: '0xsession456',
            linkedAccountsCount: 0
          },
          {
            id: 'prof_789',
            name: 'Gaming Profile',
            isActive: false,
            sessionWalletAddress: '0xsession789',
            linkedAccountsCount: 0
          }
        ],
        activeProfile: {
          id: 'prof_456',
          name: 'Trading Profile',
          sessionWalletAddress: '0xsession456'
        },
        tokens,
        isNewUser: false,
        sessionId: 'sess_456',
        privacyMode: 'linked'
      });
    });

    it('should handle Google authentication', async () => {
      req.body = {
        strategy: 'google',
        idToken: 'google_id_token'
      };

      const authResult = {
        user: { id: 'usr_google', isGuest: false },
        socialProfile: {
          providerId: 'google_12345',
          email: 'user@gmail.com',
          displayName: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg'
        }
      };

      const account = {
        id: 'acc_google',
        type: 'social',
        identifier: 'google_12345',
        provider: 'google',
        verified: true
      };

      socialAuthService.authenticateWithGoogle.mockResolvedValue(authResult);
      accountService.findOrCreateAccount.mockResolvedValue(account);
      accountService.getAccessibleProfiles.mockResolvedValue([]);
      sessionWalletService.createSessionWallet.mockResolvedValue({ address: '0xgoogle' });
      accountService.createAutomaticProfile.mockResolvedValue({
        id: 'prof_google',
        name: 'My Smartprofile'
      });
      accountService.createSession.mockResolvedValue({ sessionToken: 'google_session' });
      generateTokens.mockResolvedValue({ accessToken: 'google_token' });

      await authControllerV2.authenticateV2(req, res, next);

      expect(accountService.findOrCreateAccount).toHaveBeenCalledWith({
        type: 'social',
        identifier: 'google_12345',
        provider: 'google',
        metadata: {
          email: 'user@gmail.com',
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.jpg'
        }
      });
    });

    it('should handle guest authentication', async () => {
      req.body = {
        strategy: 'guest'
      };

      const authResult = {
        user: { id: 'usr_guest', isGuest: true }
      };

      socialAuthService.authenticateAsGuest.mockResolvedValue(authResult);
      accountService.findOrCreateAccount.mockResolvedValue({
        id: 'acc_guest',
        type: 'guest'
      });
      accountService.getAccessibleProfiles.mockResolvedValue([]);
      sessionWalletService.createSessionWallet.mockResolvedValue({ address: '0xguest' });
      accountService.createAutomaticProfile.mockResolvedValue({
        id: 'prof_guest',
        name: 'My Smartprofile'
      });
      accountService.createSession.mockResolvedValue({ sessionToken: 'guest_session' });
      generateTokens.mockResolvedValue({ accessToken: 'guest_token' });

      await authControllerV2.authenticateV2(req, res, next);

      expect(accountService.findOrCreateAccount).toHaveBeenCalledWith({
        type: 'guest',
        identifier: expect.stringMatching(/^guest_\d+_[a-z0-9]+$/),
        metadata: { temporary: true }
      });
    });

    it('should handle validation errors', async () => {
      req.body = {
        strategy: 'invalid'
      };

      await authControllerV2.authenticateV2(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Unsupported authentication strategy: invalid',
          statusCode: 400
        })
      );
    });

    it('should handle privacy mode selection', async () => {
      req.body = {
        strategy: 'wallet',
        walletAddress: '0xabc',
        signature: '0xsig',
        message: 'msg',
        privacyMode: 'isolated'
      };

      socialAuthService.authenticateWithWallet.mockResolvedValue({
        user: { id: 'usr_123' }
      });
      accountService.findOrCreateAccount.mockResolvedValue({ id: 'acc_123' });
      accountService.getAccessibleProfiles.mockResolvedValue([]);
      sessionWalletService.createSessionWallet.mockResolvedValue({ address: '0xsess' });
      accountService.createAutomaticProfile.mockResolvedValue({ id: 'prof_123' });
      accountService.createSession.mockResolvedValue({
        sessionToken: 'sess_123',
        privacyMode: 'isolated'
      });
      generateTokens.mockResolvedValue({ accessToken: 'token' });

      await authControllerV2.authenticateV2(req, res, next);

      expect(accountService.createSession).toHaveBeenCalledWith(
        'acc_123',
        expect.objectContaining({
          privacyMode: 'isolated'
        })
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          privacyMode: 'isolated'
        })
      );
    });
  });

  describe('linkAccounts', () => {
    beforeEach(() => {
      req.account = { id: 'acc_current' };
      req.headers.authorization = 'Bearer token';
    });

    it('should link accounts successfully', async () => {
      req.body = {
        targetType: 'email',
        targetIdentifier: 'new@example.com',
        privacyMode: 'linked'
      };

      const targetAccount = {
        id: 'acc_target',
        type: 'email',
        identifier: 'new@example.com'
      };

      const link = {
        id: 'link_123',
        accountAId: 'acc_current',
        accountBId: 'acc_target',
        linkType: 'direct',
        privacyMode: 'linked'
      };

      const profiles = [
        { id: 'prof_1', name: 'Profile 1', linkedAccounts: [] }
      ];

      accountService.findOrCreateAccount.mockResolvedValue(targetAccount);
      accountService.linkAccounts.mockResolvedValue(link);
      accountService.getAccessibleProfiles.mockResolvedValue(profiles);

      await authControllerV2.linkAccounts(req, res, next);

      expect(accountService.linkAccounts).toHaveBeenCalledWith(
        'acc_current',
        'acc_target',
        'direct',
        'linked'
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        link,
        linkedAccount: targetAccount,
        accessibleProfiles: [{
          id: 'prof_1',
          name: 'Profile 1',
          linkedAccountsCount: 0
        }]
      });
    });

    it('should handle social account linking', async () => {
      req.body = {
        targetType: 'social',
        targetIdentifier: 'google_67890',
        targetProvider: 'google',
        linkType: 'direct',
        privacyMode: 'partial'
      };

      accountService.findOrCreateAccount.mockResolvedValue({
        id: 'acc_social',
        type: 'social',
        provider: 'google'
      });
      accountService.linkAccounts.mockResolvedValue({});
      accountService.getAccessibleProfiles.mockResolvedValue([]);

      await authControllerV2.linkAccounts(req, res, next);

      expect(accountService.findOrCreateAccount).toHaveBeenCalledWith({
        type: 'social',
        identifier: 'google_67890',
        provider: 'google'
      });
    });
  });

  describe('updateLinkPrivacyMode', () => {
    beforeEach(() => {
      req.account = { id: 'acc_current' };
    });

    it('should update privacy mode', async () => {
      req.body = {
        targetAccountId: 'acc_target',
        privacyMode: 'isolated'
      };

      const updatedLink = {
        id: 'link_123',
        privacyMode: 'isolated'
      };

      accountService.setLinkPrivacyMode.mockResolvedValue(updatedLink);

      await authControllerV2.updateLinkPrivacyMode(req, res, next);

      expect(accountService.setLinkPrivacyMode).toHaveBeenCalledWith(
        'acc_current',
        'acc_target',
        'isolated'
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        link: updatedLink
      });
    });
  });

  describe('getIdentityGraph', () => {
    beforeEach(() => {
      req.account = { id: 'acc_current' };
    });

    it('should return identity graph', async () => {
      const linkedAccountIds = ['acc_current', 'acc_linked1', 'acc_linked2'];
      const accounts = [
        { id: 'acc_current', type: 'wallet', identifier: '0x123' },
        { id: 'acc_linked1', type: 'email', identifier: 'test@example.com' },
        { id: 'acc_linked2', type: 'social', identifier: 'google_123' }
      ];
      const links = [
        {
          accountAId: 'acc_current',
          accountBId: 'acc_linked1',
          privacyMode: 'linked'
        }
      ];

      accountService.getLinkedAccounts.mockResolvedValue(linkedAccountIds);
      
      // Mock Prisma calls
      const prismaMock = {
        account: {
          findMany: jest.fn().mockResolvedValue(accounts)
        },
        identityLink: {
          findMany: jest.fn().mockResolvedValue(links)
        }
      };
      
      // Inject mock
      jest.spyOn(require('@prisma/client'), 'PrismaClient').mockImplementation(() => prismaMock);

      await authControllerV2.getIdentityGraph(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        accounts,
        links,
        currentAccountId: 'acc_current'
      });
    });
  });

  describe('switchProfile', () => {
    beforeEach(() => {
      req.account = { id: 'acc_current' };
      req.params = { profileId: 'prof_target' };
      req.sessionToken = 'session_token';
    });

    it('should switch profile successfully', async () => {
      const profiles = [
        { id: 'prof_1', name: 'Profile 1', userId: 'usr_1' },
        { id: 'prof_target', name: 'Target Profile', userId: 'usr_1' }
      ];

      accountService.getAccessibleProfiles.mockResolvedValue(profiles);
      
      const prismaMock = {
        accountSession: {
          update: jest.fn().mockResolvedValue({})
        }
      };
      
      jest.spyOn(require('@prisma/client'), 'PrismaClient').mockImplementation(() => prismaMock);
      
      const smartProfileService = require('../../../src/services/smartProfileService');
      jest.spyOn(smartProfileService, 'setActiveProfile').mockResolvedValue();

      await authControllerV2.switchProfile(req, res, next);

      expect(prismaMock.accountSession.update).toHaveBeenCalledWith({
        where: { sessionToken: 'session_token' },
        data: { activeProfileId: 'prof_target' }
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        activeProfile: {
          id: 'prof_target',
          name: 'Target Profile',
          sessionWalletAddress: undefined
        }
      });
    });

    it('should reject inaccessible profile', async () => {
      accountService.getAccessibleProfiles.mockResolvedValue([
        { id: 'prof_other', name: 'Other Profile' }
      ]);

      await authControllerV2.switchProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Profile not found or not accessible',
          statusCode: 404
        })
      );
    });
  });
});