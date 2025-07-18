process.env.SILENCE_ADMIN_TOKEN = 'test-admin-token';
process.env.SILENCE_NODE_URL = 'http://localhost:8080';
process.env.ORBY_INSTANCE_PRIVATE_API_KEY = 'test-orby-private';
process.env.ORBY_INSTANCE_PUBLIC_API_KEY = 'test-orby-public';
process.env.ORBY_APP_NAME = 'test-app';
process.env.ORBY_PRIVATE_INSTANCE_URL = 'http://localhost:8545';
process.env.ENCRYPTION_SECRET = '0123456789abcdef0123456789abcdef';

let mockAddressCounter = 0;

jest.mock('../../../src/services/orbyService', () => ({
  orbyService: {
    createOrGetAccountCluster: jest.fn().mockResolvedValue('cluster123')
  }
}));

jest.mock('../../../src/blockchain/sessionWalletService', () => {
  return {
    sessionWalletService: {
      getSessionWalletAddress: jest.fn().mockImplementation(() => {
        mockAddressCounter++;
        return Promise.resolve(`0x${mockAddressCounter.toString().padStart(40, '0')}`);
      }),
      isSessionWalletDeployed: jest.fn().mockResolvedValue(true),
      createSessionWallet: jest.fn().mockImplementation(() => {
        mockAddressCounter++;
        return Promise.resolve(`0x${mockAddressCounter.toString().padStart(40, '0')}`);
      }),
    }
  };
});

import { smartProfileService } from '../../../src/services/smartProfileService';
import { UserFactory } from '../../factories/userFactory';
import { SmartProfileFactory } from '../../factories/smartProfileFactory';
import { NotFoundError, ConflictError } from '../../../src/types';
import { prisma } from '../../../src/utils/database';


describe('SmartProfileService', () => {
  let testUser: any;

  beforeEach(async () => {
    testUser = await UserFactory.create();
    // Reset counter for each test
    mockAddressCounter = 0;
  });

  describe.skip('createProfile', () => {
    test('should create a new smart profile with session wallet', async () => {
      const profileData = {
        name: 'Test Gaming Profile',
        clientShare: {}
      };

      const profile = await smartProfileService.createProfile(testUser.id, profileData);

      expect(profile).toMatchObject({
        name: 'Test Gaming Profile',
        isActive: false,
        linkedAccountsCount: 0,
        appsCount: 0,
        foldersCount: 0
      });
      expect(profile.id).toBeValidUUID();
      expect(profile.sessionWalletAddress).toBeValidAddress();
      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();
    });

    test('should allow duplicate profile names for same user', async () => {
      const profileData = { name: 'Duplicate Name', clientShare: {} };
      
      const profile1 = await smartProfileService.createProfile(testUser.id, profileData);
      const profile2 = await smartProfileService.createProfile(testUser.id, profileData);
      
      expect(profile1.name).toBe(profile2.name);
      expect(profile1.id).not.toBe(profile2.id);
      
      // Verify both profiles exist
      const profiles = await smartProfileService.getUserProfiles(testUser.id);
      const duplicateNameProfiles = profiles.filter(p => p.name === 'Duplicate Name');
      expect(duplicateNameProfiles.length).toBe(2);
    });

    test('should allow same profile name for different users', async () => {
      const anotherUser = await UserFactory.create();
      const profileData = { name: 'Same Name', clientShare: {} };
      
      const profile1 = await smartProfileService.createProfile(testUser.id, profileData);
      const profile2 = await smartProfileService.createProfile(anotherUser.id, profileData);
      
      expect(profile1.name).toBe(profile2.name);
      expect(profile1.id).not.toBe(profile2.id);
    });

    test('should create audit log entry', async () => {
      const profileData = { name: 'Audit Test Profile', clientShare: {} };
      
      const profile = await smartProfileService.createProfile(testUser.id, profileData);
      
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          profileId: profile.id,
          action: 'SMART_PROFILE_CREATED'
        }
      });
      
      expect(auditLog).toBeTruthy();
      expect(auditLog!.resource).toBe('SmartProfile');
    });
  });

  describe('getUserProfiles', () => {
    test('should return all profiles for user', async () => {
      await SmartProfileFactory.create({ userId: testUser.id, name: 'Profile 1' });
      await SmartProfileFactory.create({ userId: testUser.id, name: 'Profile 2' });
      
      const profiles = await smartProfileService.getUserProfiles(testUser.id);
      
      expect(profiles).toHaveLength(2);
      expect(profiles.map(p => p.name)).toContain('Profile 1');
      expect(profiles.map(p => p.name)).toContain('Profile 2');
    });

    test('should return empty array if user has no profiles', async () => {
      const profiles = await smartProfileService.getUserProfiles(testUser.id);
      expect(profiles).toHaveLength(0);
    });

    test('should order profiles by creation date (newest first)', async () => {
      const profile1 = await SmartProfileFactory.create({ 
        userId: testUser.id, 
        name: 'First Profile' 
      });
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const profile2 = await SmartProfileFactory.create({ 
        userId: testUser.id, 
        name: 'Second Profile' 
      });
      
      const profiles = await smartProfileService.getUserProfiles(testUser.id);
      
      expect(profiles).toHaveLength(2);
      expect(profiles[0]?.name).toBe('Second Profile');
      expect(profiles[1]?.name).toBe('First Profile');
    });
  });

  describe('getProfileById', () => {
    test('should return profile for valid ID and user', async () => {
      const createdProfile = await SmartProfileFactory.create({ 
        userId: testUser.id,
        name: 'Test Profile'
      });
      
      const profile = await smartProfileService.getProfileById(createdProfile.id, testUser.id);
      
      expect(profile.id).toBe(createdProfile.id);
      expect(profile.name).toBe('Test Profile');
    });

    test('should throw NotFoundError for invalid profile ID', async () => {
      await expect(
        smartProfileService.getProfileById('invalid-id', testUser.id)
      ).rejects.toThrow(NotFoundError);
    });

    test('should throw NotFoundError when user tries to access another user\'s profile', async () => {
      const anotherUser = await UserFactory.create();
      const profile = await SmartProfileFactory.create({ userId: anotherUser.id });
      
      await expect(
        smartProfileService.getProfileById(profile.id, testUser.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    let testProfile: any;

    beforeEach(async () => {
      testProfile = await SmartProfileFactory.create({ userId: testUser.id });
    });

    test('should update profile name', async () => {
      const updatedProfile = await smartProfileService.updateProfile(
        testProfile.id,
        testUser.id,
        { name: 'Updated Name' }
      );
      
      expect(updatedProfile.name).toBe('Updated Name');
      expect(updatedProfile.id).toBe(testProfile.id);
    });

    test('should activate profile and deactivate others', async () => {
      const activeProfile = await SmartProfileFactory.createActiveProfile(testUser.id);
      
      const updatedProfile = await smartProfileService.updateProfile(
        testProfile.id,
        testUser.id,
        { isActive: true }
      );
      
      expect(updatedProfile.isActive).toBe(true);
      
      // Check that the previously active profile is now inactive
      const previouslyActive = await smartProfileService.getProfileById(activeProfile.id, testUser.id);
      expect(previouslyActive.isActive).toBe(false);
    });

    test('should allow duplicate names', async () => {
      await SmartProfileFactory.create({ 
        userId: testUser.id, 
        name: 'Existing Name' 
      });
      
      const updatedProfile = await smartProfileService.updateProfile(
        testProfile.id, 
        testUser.id, 
        { name: 'Existing Name' }
      );
      
      expect(updatedProfile.name).toBe('Existing Name');
      
      // Verify both profiles have the same name
      const profiles = await smartProfileService.getUserProfiles(testUser.id);
      const sameNameProfiles = profiles.filter(p => p.name === 'Existing Name');
      expect(sameNameProfiles.length).toBe(2);
    });

    test('should create audit log for updates', async () => {
      await smartProfileService.updateProfile(
        testProfile.id,
        testUser.id,
        { name: 'Audited Update' }
      );
      
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          profileId: testProfile.id,
          action: 'SMART_PROFILE_UPDATED'
        }
      });
      
      expect(auditLog).toBeTruthy();
    });
  });

  describe('deleteProfile', () => {
    test('should delete profile successfully', async () => {
      const profile = await SmartProfileFactory.create({ userId: testUser.id });
      
      await smartProfileService.deleteProfile(profile.id, testUser.id);
      
      await expect(
        smartProfileService.getProfileById(profile.id, testUser.id)
      ).rejects.toThrow(NotFoundError);
    });

    test('should throw error when deleting non-existent profile', async () => {
      await expect(
        smartProfileService.deleteProfile('invalid-id', testUser.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getActiveProfile', () => {
    test('should return active profile', async () => {
      const activeProfile = await SmartProfileFactory.createActiveProfile(testUser.id);
      await SmartProfileFactory.create({ userId: testUser.id }); // inactive
      
      const result = await smartProfileService.getActiveProfile(testUser.id);
      
      expect(result!.id).toBe(activeProfile.id);
      expect(result!.isActive).toBe(true);
    });

    test('should return null if no active profile', async () => {
      await SmartProfileFactory.create({ userId: testUser.id }); // inactive
      
      const result = await smartProfileService.getActiveProfile(testUser.id);
      
      expect(result).toBeNull();
    });
  });

  describe('switchActiveProfile', () => {
    test('should switch active profile correctly', async () => {
      const profile1 = await SmartProfileFactory.createActiveProfile(testUser.id);
      const profile2 = await SmartProfileFactory.create({ userId: testUser.id });
      
      const result = await smartProfileService.switchActiveProfile(profile2.id, testUser.id);
      
      expect(result.id).toBe(profile2.id);
      expect(result.isActive).toBe(true);
      
      // Check that profile1 is now inactive
      const updatedProfile1 = await smartProfileService.getProfileById(profile1.id, testUser.id);
      expect(updatedProfile1.isActive).toBe(false);
    });

    test('should create audit log for profile switch', async () => {
      const profile = await SmartProfileFactory.create({ userId: testUser.id });
      
      await smartProfileService.switchActiveProfile(profile.id, testUser.id);
      
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: testUser.id,
          profileId: profile.id,
          action: 'SMART_PROFILE_ACTIVATED'
        }
      });
      
      expect(auditLog).toBeTruthy();
    });
  });

  describe('validateSessionWallet', () => {
    test('should validate session wallet successfully', async () => {
      const profile = await SmartProfileFactory.create({ userId: testUser.id });
      
      const isValid = await smartProfileService.validateSessionWallet(profile.id, testUser.id);
      
      expect(isValid).toBe(true);
    });
  });
});
