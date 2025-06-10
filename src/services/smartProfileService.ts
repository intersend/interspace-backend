import { prisma, withTransaction, withRetryableTransaction } from '@/utils/database';
import { 
  CreateSmartProfileRequest,
  UpdateSmartProfileRequest,
  SmartProfileResponse,
  NotFoundError,
  ConflictError,
  AuthorizationError 
} from '@/types';
import { sessionWalletService } from '@/blockchain/sessionWalletService';
import { orbyService } from '@/services/orbyService';
import { config as defaultConfig } from '@/utils/config';

export class SmartProfileService {
  private config = defaultConfig;

  constructor(config = defaultConfig) {
    this.config = config;
  }
  
  /**
   * Create a new SmartProfile with session wallet
   */
  async createProfile(
    userId: string, 
    data: CreateSmartProfileRequest,
    primaryWalletAddress?: string
  ): Promise<SmartProfileResponse> {
    // Use retryable transaction with extended timeout
    return withRetryableTransaction(async (tx) => {
      // Check if user already has a profile with this name
      const existingProfile = await tx.smartProfile.findFirst({
        where: {
          userId,
          name: data.name
        }
      });

      if (existingProfile) {
        throw new ConflictError('Profile with this name already exists');
      }

      // Create profile first to get ID
      const profile = await tx.smartProfile.create({
        data: {
          userId,
          name: data.name,
          sessionWalletAddress: 'pending', // Temporary placeholder
          isActive: false,
        }
      });

      try {
        let sessionWalletAddress: string;
        if (this.config.DISABLE_MPC) {
          console.log('MPC disabled; skipping session wallet creation');
          sessionWalletAddress = '0x0000000000000000000000000000000000000000';
        } else {
          // Create session wallet using the profile ID
          console.log(`Creating session wallet for profile ${profile.id}...`);
          const result = await sessionWalletService.createSessionWallet(
            profile.id,
            data.clientShare
          );
          sessionWalletAddress = result.address;
        }

        // Update profile with actual or placeholder session wallet address
        const updatedProfile = await tx.smartProfile.update({
          where: { id: profile.id },
          data: { sessionWalletAddress },
          include: {
            linkedAccounts: true,
            folders: true,
            apps: true,
            _count: {
              select: {
                linkedAccounts: true,
                apps: true,
                folders: true
              }
            }
          }
        });

        // Log the profile creation early (before Orby)
        await tx.auditLog.create({
          data: {
            userId,
            profileId: profile.id,
            action: 'SMART_PROFILE_CREATED',
            resource: 'SmartProfile',
            details: JSON.stringify({
              profileName: data.name,
              sessionWalletAddress,
              chainId: this.config.DEFAULT_CHAIN_ID
            })
          }
        });

        // Create Orby account cluster for the profile (pass transaction context)
        try {
          console.log(`Creating Orby cluster for profile ${profile.id}...`);
          const clusterId = await orbyService.createOrGetAccountCluster(updatedProfile, tx);
          
          // The cluster ID is already saved by orbyService.createOrGetAccountCluster
          // Just update our local copy
          updatedProfile.orbyAccountClusterId = clusterId as any;
          
          console.log(`Orby cluster created successfully: ${clusterId}`);
        } catch (orbyError) {
          // Log detailed error for debugging
          console.error('Failed to create Orby cluster (non-blocking):', {
            profileId: profile.id,
            error: orbyError instanceof Error ? orbyError.message : orbyError,
            stack: orbyError instanceof Error ? orbyError.stack : undefined
          });
          // Don't fail profile creation if Orby fails
          // Profile can still function without Orby integration
        }

        return this.formatProfileResponse(updatedProfile);

      } catch (error) {
        // Log the error for debugging
        console.error(`Profile creation failed for user ${userId}:`, {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });

        // If session wallet creation fails, delete the profile
        // Note: This might fail if the transaction has already been rolled back
        try {
          await tx.smartProfile.delete({
            where: { id: profile.id }
          });
        } catch (deleteError) {
          // Profile might already be rolled back, ignore delete error
          console.warn('Could not delete profile after failure (may already be rolled back):', deleteError);
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to create profile: ${errorMessage}`);
      }
    }, {
      timeout: 45000, // 45 seconds timeout for the entire operation
      maxRetries: 2, // Retry up to 2 times on retryable errors
      retryDelay: 2000 // Wait 2 seconds between retries
    });
  }

  /**
   * Get all profiles for a user
   */
  async getUserProfiles(userId: string): Promise<SmartProfileResponse[]> {
    const profiles = await prisma.smartProfile.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            linkedAccounts: true,
            apps: true,
            folders: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return profiles.map(profile => this.formatProfileResponse(profile));
  }

  /**
   * Get a specific profile by ID
   */
  async getProfileById(profileId: string, userId: string): Promise<SmartProfileResponse> {
    const profile = await prisma.smartProfile.findFirst({
      where: { 
        id: profileId,
        userId 
      },
      include: {
        _count: {
          select: {
            linkedAccounts: true,
            apps: true,
            folders: true
          }
        }
      }
    });

    if (!profile) {
      throw new NotFoundError('SmartProfile');
    }

    return this.formatProfileResponse(profile);
  }

  /**
   * Update a profile
   */
  async updateProfile(
    profileId: string, 
    userId: string, 
    data: UpdateSmartProfileRequest
  ): Promise<SmartProfileResponse> {
    return withTransaction(async (tx) => {
      // Verify ownership
      const existingProfile = await tx.smartProfile.findFirst({
        where: { 
          id: profileId,
          userId 
        }
      });

      if (!existingProfile) {
        throw new NotFoundError('SmartProfile');
      }

      // If updating name, check for conflicts
      if (data.name && data.name !== existingProfile.name) {
        const nameConflict = await tx.smartProfile.findFirst({
          where: {
            userId,
            name: data.name,
            id: { not: profileId }
          }
        });

        if (nameConflict) {
          throw new ConflictError('Profile with this name already exists');
        }
      }

      // Handle activation logic
      if (data.isActive === true) {
        // Deactivate all other profiles for this user
        await tx.smartProfile.updateMany({
          where: { 
            userId,
            id: { not: profileId }
          },
          data: { isActive: false }
        });
      }

      // Update the profile
      const updatedProfile = await tx.smartProfile.update({
        where: { id: profileId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          updatedAt: new Date()
        },
        include: {
          _count: {
            select: {
              linkedAccounts: true,
              apps: true,
              folders: true
            }
          }
        }
      });

      // Log the update
      await tx.auditLog.create({
        data: {
          userId,
          profileId: profileId,
          action: 'SMART_PROFILE_UPDATED',
          resource: 'SmartProfile',
          details: JSON.stringify({
            updatedFields: Object.keys(data),
            changes: data
          })
        }
      });

      return this.formatProfileResponse(updatedProfile);
    });
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileId: string, userId: string): Promise<void> {
    return withTransaction(async (tx) => {
      // Verify ownership
      const profile = await tx.smartProfile.findFirst({
        where: { 
          id: profileId,
          userId 
        },
        include: {
          linkedAccounts: true
        }
      });

      if (!profile) {
        throw new NotFoundError('SmartProfile');
      }

      // Check if profile has linked accounts
      if (profile.linkedAccounts.length > 0) {
        throw new ConflictError('Cannot delete profile with linked accounts. Please remove all linked accounts first.');
      }

      // Log the deletion before actually deleting
      await tx.auditLog.create({
        data: {
          userId,
          profileId: profileId,
          action: 'SMART_PROFILE_DELETED',
          resource: 'SmartProfile',
          details: JSON.stringify({
            profileName: profile.name,
            sessionWalletAddress: profile.sessionWalletAddress
          })
        }
      });

      // Delete the profile (cascading deletes will handle apps, folders, etc.)
      await tx.smartProfile.delete({
        where: { id: profileId }
      });
    });
  }

  /**
   * Get active profile for a user
   */
  async getActiveProfile(userId: string): Promise<SmartProfileResponse | null> {
    const activeProfile = await prisma.smartProfile.findFirst({
      where: { 
        userId,
        isActive: true 
      },
      include: {
        _count: {
          select: {
            linkedAccounts: true,
            apps: true,
            folders: true
          }
        }
      }
    });

    return activeProfile ? this.formatProfileResponse(activeProfile) : null;
  }

  /**
   * Switch active profile
   */
  async switchActiveProfile(profileId: string, userId: string): Promise<SmartProfileResponse> {
    return withTransaction(async (tx) => {
      // Verify ownership and that profile exists
      const profile = await tx.smartProfile.findFirst({
        where: { 
          id: profileId,
          userId 
        }
      });

      if (!profile) {
        throw new NotFoundError('SmartProfile');
      }

      // Deactivate all profiles
      await tx.smartProfile.updateMany({
        where: { userId },
        data: { isActive: false }
      });

      // Activate the target profile
      const updatedProfile = await tx.smartProfile.update({
        where: { id: profileId },
        data: { isActive: true },
        include: {
          _count: {
            select: {
              linkedAccounts: true,
              apps: true,
              folders: true
            }
          }
        }
      });

      // Log the profile switch
      await tx.auditLog.create({
        data: {
          userId,
          profileId: profileId,
          action: 'SMART_PROFILE_ACTIVATED',
          resource: 'SmartProfile',
          details: JSON.stringify({
            profileName: profile.name,
            sessionWalletAddress: profile.sessionWalletAddress
          })
        }
      });

      return this.formatProfileResponse(updatedProfile);
    });
  }

  /**
   * Get session wallet transaction routing for a profile
   */
  async getTransactionRouting(profileId: string, userId: string, targetApp: string): Promise<any> {
    const profile = await this.getProfileById(profileId, userId);
    
    // Get primary linked account
    const primaryAccount = await prisma.linkedAccount.findFirst({
      where: {
        profileId,
        isPrimary: true
      }
    });

    if (!primaryAccount) {
      throw new NotFoundError('Primary linked account not found for this profile');
    }

    return sessionWalletService.getTransactionRouting(
      primaryAccount.address,
      profile.sessionWalletAddress,
      targetApp
    );
  }

  /**
   * Validate session wallet
   */
  async validateSessionWallet(profileId: string, userId: string): Promise<boolean> {
    return sessionWalletService.isSessionWalletDeployed(profileId);
  }

  /**
   * Get session wallet address for a profile
   */
  async getSessionWalletAddress(profileId: string, userId: string): Promise<string> {
    // Verify ownership
    await this.getProfileById(profileId, userId);
    
    return sessionWalletService.getSessionWalletAddress(profileId);
  }

  /**
   * Execute transaction through profile's session wallet
   */
  async executeTransaction(
    profileId: string,
    userId: string,
    targetAddress: string,
    value: string,
    data: string,
    chainId: number = this.config.DEFAULT_CHAIN_ID
  ): Promise<string> {
    // Verify ownership
    await this.getProfileById(profileId, userId);
    
    return sessionWalletService.executeTransaction(
      profileId,
      targetAddress,
      value,
      data,
      chainId
    );
  }

  /**
   * Rotate the session wallet key shares for a profile
   */
  async rotateSessionWallet(profileId: string, userId: string): Promise<any> {
    // Verify ownership
    await this.getProfileById(profileId, userId);
    return sessionWalletService.rotateSessionWallet(profileId);
  }

  // Social profile methods have been moved to UserService
  // Social profiles are now managed at the user level, not profile level

  /**
   * Format profile data for API response
   */
  private formatProfileResponse(profile: any): SmartProfileResponse {
    return {
      id: profile.id,
      name: profile.name,
      sessionWalletAddress: profile.sessionWalletAddress,
      isActive: profile.isActive,
      linkedAccountsCount: profile._count?.linkedAccounts || 0,
      appsCount: profile._count?.apps || 0,
      foldersCount: profile._count?.folders || 0,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}

export const smartProfileService = new SmartProfileService(defaultConfig);
