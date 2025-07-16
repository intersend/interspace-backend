import { prisma, withTransaction, withRetryableTransaction, Prisma } from '../utils/database';
import { 
  CreateSmartProfileRequest,
  UpdateSmartProfileRequest,
  SmartProfileResponse,
  NotFoundError,
  ConflictError,
  AuthorizationError 
} from '@/types';
import { sessionWalletService } from '../blockchain/sessionWalletService';
import { orbyService } from '../services/orbyService';
import { websocketService } from '../services/websocketService';
import { config as defaultConfig, type Config } from '../utils/config';

export class SmartProfileService {
  private config = defaultConfig;

  constructor(config: Config = defaultConfig) {
    this.config = config;
  }
  
  /**
   * Create a new SmartProfile with session wallet
   */
  async createProfile(
    accountId: string, 
    data: CreateSmartProfileRequest,
    primaryWalletAddress?: string
  ): Promise<SmartProfileResponse> {
    let profileData: any;
    
    // Use retryable transaction with extended timeout
    profileData = await withRetryableTransaction(async (tx) => {
      // Allow duplicate profile names - no need to check for existing names

      // Create profile first to get ID
      const profile = await tx.smartProfile.create({
        data: {
          name: data.name,
          sessionWalletAddress: 'pending', // Temporary placeholder
          isActive: false,
        }
      });

      // Create ProfileAccount relationship
      await tx.profileAccount.create({
        data: {
          profileId: profile.id,
          accountId,
          isPrimary: true,
          permissions: { role: 'OWNER' } // Store role in permissions JSON field
        }
      });

      // Check if this is the user's first profile
      const existingProfiles = await tx.profileAccount.count({
        where: { accountId }
      });
      
      // ALWAYS link the creating account to the profile - this is essential for profile-centric architecture
      // Get the account details
      const account = await tx.account.findUnique({
        where: { id: accountId }
      });
      
      if (account) {
        // Determine the authStrategy based on account type
        let authStrategy: string;
        if (account.type === 'social') {
          //@ts-ignore
          authStrategy = account.provider; // 'apple', 'google', etc.
        } else {
          authStrategy = account.type; // 'wallet', 'email', 'passkey'
        }
        
        // Create LinkedAccount entry for ANY account type
        await tx.linkedAccount.create({
          data: {
            profileId: profile.id,
            address: account.identifier.toLowerCase(),
            authStrategy,
            walletType: account.type === 'wallet' ? ((account.metadata as any)?.walletType || 'external') : null,
            customName: (account.metadata as any)?.customName || null,
            isPrimary: existingProfiles === 0, // Only first profile gets primary status
            isActive: true,
            chainId: (account.metadata as any)?.chainId ? parseInt((account.metadata as any).chainId) : 1,
            metadata: JSON.stringify(account.metadata || {})
          }
        });
        
        console.log(`Linked ${authStrategy} account ${account.identifier} to profile ${profile.id}`);
        console.log(`LinkedAccount details:`, {
          profileId: profile.id,
          address: account.identifier.toLowerCase(),
          authStrategy,
          walletType: account.type === 'wallet' ? ((account.metadata as any)?.walletType || 'external') : null,
          isPrimary: existingProfiles === 0,
          accountType: account.type,
          provider: account.provider
        });
      } else {
        console.error(`WARNING: Could not find account ${accountId} to link to profile ${profile.id}`);
      }

      try {
        // Always use placeholder wallet initially
        // MPC wallet generation should be triggered separately by the iOS client
        console.log(`Creating placeholder wallet for MPC profile ${profile.id}...`);
        const { ethers } = require('ethers');
        const sessionWalletAddress = ethers.Wallet.createRandom().address;
        console.log(`Generated placeholder session wallet address: ${sessionWalletAddress}`);
        console.log(`MPC wallet generation should be triggered by iOS client via /api/v2/mpc/generate`);

        // Update profile with actual or placeholder session wallet address
        const updatedProfile = await tx.smartProfile.update({
          where: { id: profile.id },
          data: { 
            sessionWalletAddress
          },
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
            accountId,
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

        // Return the profile data from transaction
        return {
          profile: updatedProfile
        };

      } catch (error) {
        // Log the error for debugging
        console.error(`Profile creation failed for account ${accountId}:`, {
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
      timeout: 30000, // 30 seconds timeout for the transaction
      maxRetries: 2, // Retry up to 2 times on retryable errors
      retryDelay: 2000 // Wait 2 seconds between retries
    });

    // Extract values from transaction result
    const updatedProfile = profileData.profile;

    // Create Orby account cluster OUTSIDE the transaction
    try {
        console.log(`Creating Orby cluster for profile ${updatedProfile.id}...`);
        
        // Implement retry logic with exponential backoff
        const createClusterWithRetry = async (maxRetries = 3): Promise<string> => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              // Add timeout to prevent hanging
              const orbyPromise = orbyService.createFreshAccountCluster(updatedProfile);
              const timeoutPromise = new Promise<string>((_, reject) => 
                setTimeout(() => reject(new Error('Orby cluster creation timeout')), 10000) // 10 second timeout
              );
              
              const clusterId = await Promise.race([orbyPromise, timeoutPromise]);
              return clusterId;
            } catch (error) {
              const isLastAttempt = attempt === maxRetries;
              const errorMessage = error instanceof Error ? error.message : String(error);
              
              console.warn(`Orby cluster creation attempt ${attempt}/${maxRetries} failed:`, {
                profileId: updatedProfile.id,
                error: errorMessage,
                isLastAttempt
              });
              
              if (isLastAttempt) {
                throw error;
              }
              
              // Exponential backoff: 1s, 2s, 4s
              const backoffDelay = Math.pow(2, attempt - 1) * 1000;
              console.log(`Retrying Orby cluster creation in ${backoffDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
          }
          throw new Error('Failed to create Orby cluster after all retries');
        };
        
        const clusterId = await createClusterWithRetry();
        
        console.log(`Orby cluster created successfully: ${clusterId}`);
        
        // Create an audit log entry for successful Orby integration
        await prisma.auditLog.create({
          data: {
            accountId,
            profileId: updatedProfile.id,
            action: 'ORBY_CLUSTER_CREATED',
            resource: 'OrbyAccountCluster',
            details: JSON.stringify({
              clusterId,
              profileName: updatedProfile.name
            })
          }
        });
      } catch (orbyError) {
        // Log detailed error for debugging
        console.error('Failed to create Orby cluster (non-blocking):', {
          profileId: updatedProfile.id,
          error: orbyError instanceof Error ? orbyError.message : orbyError,
          stack: orbyError instanceof Error ? orbyError.stack : undefined
        });
        
        // Create an audit log entry for failed Orby integration
        await prisma.auditLog.create({
          data: {
            accountId,
            profileId: updatedProfile.id,
            action: 'ORBY_CLUSTER_CREATION_FAILED',
            resource: 'OrbyAccountCluster',
            details: JSON.stringify({
              error: orbyError instanceof Error ? orbyError.message : String(orbyError),
              profileName: updatedProfile.name
            })
          }
        });
        
        // Don't fail profile creation if Orby fails
        // Profile can still function without Orby integration
        // TODO: Consider adding a background job to retry cluster creation later
    }

    const response = await this.formatProfileResponse(updatedProfile);
    
    // Emit WebSocket event for profile creation
    // This helps iOS know when to trigger MPC generation
    websocketService.emitProfileCreated(accountId, response, response.needsMpcGeneration || false);
    
    return response;
  }

  /**
   * Get all profiles for a user
   * @deprecated Use getAccountProfiles instead
   */
  async getUserProfiles(accountId: string): Promise<SmartProfileResponse[]> {
    return this.getAccountProfiles(accountId);
  }

  /**
   * Get all profiles for an account
   */
  async getAccountProfiles(accountId: string): Promise<SmartProfileResponse[]> {
    const profileAccounts = await prisma.profileAccount.findMany({
      where: { accountId },
      include: {
        profile: {
          include: {
            _count: {
              select: {
                linkedAccounts: true,
                apps: true,
                folders: true
              }
            }
          }
        }
      },
      orderBy: { profile: { createdAt: 'desc' } }
    });

    return Promise.all(profileAccounts.map(pa => this.formatProfileResponse(pa.profile)));
  }

  /**
   * Get a specific profile by ID
   */
  async getProfileById(profileId: string, accountId: string): Promise<SmartProfileResponse> {
    const profileAccount = await prisma.profileAccount.findFirst({
      where: { 
        profileId,
        accountId 
      },
      include: {
        profile: {
          include: {
            _count: {
              select: {
                linkedAccounts: true,
                apps: true,
                folders: true
              }
            }
          }
        }
      }
    });

    if (!profileAccount) {
      throw new NotFoundError('SmartProfile');
    }

    return await this.formatProfileResponse(profileAccount.profile);
  }

  /**
   * Update a profile
   */
  async updateProfile(
    profileId: string, 
    accountId: string, 
    data: UpdateSmartProfileRequest
  ): Promise<SmartProfileResponse> {
    return withTransaction(async (tx) => {
      // Verify ownership
      const existingProfileAccount = await tx.profileAccount.findFirst({
        where: { 
          profileId,
          accountId 
        },
        include: { profile: true }
      });

      if (!existingProfileAccount) {
        throw new NotFoundError('SmartProfile');
      }

      // Allow duplicate profile names - no need to check for conflicts when updating

      // Handle activation logic
      if (data.isActive === true) {
        // Deactivate all other profiles for this account
        const accountProfiles = await tx.profileAccount.findMany({
          where: { accountId },
          select: { profileId: true }
        });
        
        const profileIds = accountProfiles.map(ap => ap.profileId);
        
        await tx.smartProfile.updateMany({
          where: { 
            id: { 
              in: profileIds,
              not: profileId 
            }
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
          accountId,
          profileId: profileId,
          action: 'SMART_PROFILE_UPDATED',
          resource: 'SmartProfile',
          details: JSON.stringify({
            updatedFields: Object.keys(data),
            changes: data
          })
        }
      });

      return await this.formatProfileResponse(updatedProfile);
    });
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileId: string, accountId: string): Promise<void> {
    return withTransaction(async (tx) => {
      // Verify ownership
      const profileAccount = await tx.profileAccount.findFirst({
        where: { 
          profileId,
          accountId 
        },
        include: {
          profile: {
            include: {
              linkedAccounts: true
            }
          }
        }
      });

      if (!profileAccount) {
        throw new NotFoundError('SmartProfile');
      }

      const profile = profileAccount.profile;
      const wasActive = profile.isActive;

      // In flat identity model, we allow deleting profiles even with linked accounts
      // The cascade delete will handle removing all related data

      // Log the deletion before actually deleting
      await tx.auditLog.create({
        data: {
          accountId,
          profileId: profileId,
          action: 'SMART_PROFILE_DELETED',
          resource: 'SmartProfile',
          details: JSON.stringify({
            profileName: profile.name,
            sessionWalletAddress: profile.sessionWalletAddress,
            wasActive
          })
        }
      });

      // Temporary workaround: Manually delete ProfileAccount records first
      // This is necessary until the cascade delete migration is applied
      await tx.profileAccount.deleteMany({
        where: { profileId: profileId }
      });

      // Delete the profile (cascading deletes will handle apps, folders, etc.)
      await tx.smartProfile.delete({
        where: { id: profileId }
      });

      // If deleted profile was active, activate another profile
      if (wasActive) {
        // Find all other profiles for this account
        const remainingProfiles = await tx.profileAccount.findMany({
          where: { accountId },
          include: { profile: true },
          orderBy: { profile: { updatedAt: 'desc' } }
        });

        if (remainingProfiles.length > 0 && remainingProfiles[0]) {
          // Activate the most recently updated profile
          const nextProfile = remainingProfiles[0];
          const nextProfileId = nextProfile.profileId;
          await tx.smartProfile.update({
            where: { id: nextProfileId },
            data: { isActive: true }
          });

          console.log(`Profile ${profileId} was active, activated profile ${nextProfileId} (${nextProfile.profile.name})`);
          
          // Log the automatic activation
          await tx.auditLog.create({
            data: {
              accountId,
              profileId: nextProfileId,
              action: 'SMART_PROFILE_ACTIVATED',
              resource: 'SmartProfile',
              details: JSON.stringify({
                reason: 'Automatic activation after active profile deletion',
                deletedProfileId: profileId,
                profileName: nextProfile.profile.name
              })
            }
          });
        } else {
          console.log(`Profile ${profileId} was the last profile for account ${accountId}`);
        }
      }
    });
  }

  /**
   * Get active profile for a user
   */
  async getActiveProfile(accountId: string): Promise<SmartProfileResponse | null> {
    const activeProfileAccount = await prisma.profileAccount.findFirst({
      where: { 
        accountId,
        profile: {
          isActive: true
        }
      },
      include: {
        profile: {
          include: {
            _count: {
              select: {
                linkedAccounts: true,
                apps: true,
                folders: true
              }
            }
          }
        }
      }
    });

    return activeProfileAccount ? await this.formatProfileResponse(activeProfileAccount.profile) : null;
  }

  /**
   * Switch active profile
   */
  async switchActiveProfile(profileId: string, accountId: string): Promise<SmartProfileResponse> {
    return withRetryableTransaction(async (tx) => {
      // Verify ownership and that profile exists
      const profileAccount = await tx.profileAccount.findFirst({
        where: { 
          profileId,
          accountId 
        },
        include: { profile: true }
      });

      if (!profileAccount) {
        throw new NotFoundError('SmartProfile');
      }

      const profile = profileAccount.profile;

      // Deactivate all profiles for this account
      const accountProfiles = await tx.profileAccount.findMany({
        where: { accountId },
        select: { profileId: true }
      });
      
      const profileIds = accountProfiles.map(ap => ap.profileId);
      
      await tx.smartProfile.updateMany({
        where: { id: { in: profileIds } },
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
          accountId,
          profileId: profileId,
          action: 'SMART_PROFILE_ACTIVATED',
          resource: 'SmartProfile',
          details: JSON.stringify({
            profileName: profile.name,
            sessionWalletAddress: profile.sessionWalletAddress
          })
        }
      });

      return await this.formatProfileResponse(updatedProfile);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxRetries: 3,
      retryDelay: 1000
    });
  }

  /**
   * Get session wallet transaction routing for a profile
   */
  async getTransactionRouting(profileId: string, accountId: string, targetApp: string): Promise<any> {
    const profile = await this.getProfileById(profileId, accountId);
    
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
  async validateSessionWallet(profileId: string, accountId: string): Promise<boolean> {
    return sessionWalletService.isSessionWalletDeployed(profileId);
  }

  /**
   * Get session wallet address for a profile
   */
  async getSessionWalletAddress(profileId: string, accountId: string): Promise<string> {
    // Verify ownership
    await this.getProfileById(profileId, accountId);
    
    return sessionWalletService.getSessionWalletAddress(profileId);
  }

  /**
   * Execute transaction through profile's session wallet
   */
  async executeTransaction(
    profileId: string,
    accountId: string,
    targetAddress: string,
    value: string,
    data: string,
    chainId: number = this.config.DEFAULT_CHAIN_ID
  ): Promise<string> {
    // Verify ownership
    await this.getProfileById(profileId, accountId);
    
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
  async rotateSessionWallet(profileId: string, accountId: string): Promise<any> {
    // Verify ownership
    await this.getProfileById(profileId, accountId);
    return sessionWalletService.rotateSessionWallet(profileId);
  }

  // Social profile methods have been moved to UserService
  // Social profiles are now managed at the user level, not profile level

  /**
   * Generate MPC wallet for a profile
   * This triggers the key generation process with duo-node
   */
  private async generateMPCWallet(profileId: string, accountId: string): Promise<{ address: string; keyId: string }> {
    try {
      // Get the duo-node URL from config
      const duoNodeUrl = process.env.DUO_NODE_URL || 'http://localhost:3001';
      
      // Generate a unique session ID
      const sessionId = `${profileId}_${Date.now()}`;
      
      // TODO: This currently requires WebSocket connection from iOS
      // We need to implement a REST endpoint that can trigger key generation
      // For now, throw an error to use placeholder
      throw new Error('MPC key generation requires iOS client connection');
      
      // Future implementation:
      // 1. Call duo-node to initiate key generation
      // 2. Wait for webhook callback with the generated address
      // 3. Return the address and key ID
    } catch (error) {
      console.error('MPC wallet generation failed:', error);
      throw error;
    }
  }

  /**
   * Update profile wallet address after MPC key generation
   */
  async updateProfileWalletAddress(profileId: string, walletAddress: string): Promise<void> {
    await prisma.smartProfile.update({
      where: { id: profileId },
      data: { sessionWalletAddress: walletAddress }
    });
  }

  /**
   * Format profile data for API response
   */
  private async formatProfileResponse(profile: any): Promise<SmartProfileResponse> {
    // Check if profile has an MPC key mapping (indicates real MPC wallet)
    const mpcKeyMapping = await prisma.mpcKeyMapping.findUnique({
      where: { profileId: profile.id }
    });
    const needsMpcGeneration = !mpcKeyMapping;

    return {
      id: profile.id,
      name: profile.name,
      sessionWalletAddress: profile.sessionWalletAddress,
      isActive: profile.isActive,
      linkedAccountsCount: profile._count?.linkedAccounts || 0,
      appsCount: profile._count?.apps || 0,
      foldersCount: profile._count?.folders || 0,
      needsMpcGeneration,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}

export const smartProfileService = new SmartProfileService(defaultConfig);
