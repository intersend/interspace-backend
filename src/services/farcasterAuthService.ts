import { ethers } from 'ethers';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { siweService } from './siweService';
import crypto from 'crypto';
import axios from 'axios';

interface FarcasterChannel {
  channelToken: string;
  url: string;
  nonce: string;
  expiresAt: Date;
}

interface FarcasterAuthResponse {
  signature: string;
  message: string;
  fid: string;
  username?: string;
  displayName?: string;
  bio?: string;
  pfpUrl?: string;
  custody?: string;
}

interface FarcasterUserData {
  fid: string;
  username?: string;
  displayName?: string;
  bio?: string;
  pfpUrl?: string;
  custody?: string;
  verifications?: string[];
}

export class FarcasterAuthService {
  private readonly CHANNEL_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
  private readonly OPTIMISM_RPC = process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io';
  private readonly FARCASTER_RELAY_URL = process.env.FARCASTER_RELAY_URL || 'https://relay.farcaster.xyz';
  
  // Farcaster contract addresses on Optimism Mainnet
  private readonly ID_REGISTRY_ADDRESS = '0x00000000fc6c5f01fc30151999387bb99a9f489b';
  private readonly KEY_REGISTRY_ADDRESS = '0x00000000fc1237824fb747abde0ff18990e59b7e';

  /**
   * Create a new authentication channel for Farcaster Sign In
   */
  async createChannel(params: {
    domain: string;
    siweUri: string;
  }): Promise<FarcasterChannel> {
    try {
      const channelToken = crypto.randomBytes(32).toString('hex');
      const nonce = await siweService.generateNonce();
      const expiresAt = new Date(Date.now() + this.CHANNEL_EXPIRY_MS);

      // Store channel in database
      await prisma.farcasterAuthChannel.create({
        data: {
          channelToken,
          nonce,
          domain: params.domain,
          siweUri: params.siweUri,
          expiresAt,
          status: 'pending'
        }
      });

      // In production, you would register this channel with the Farcaster relay
      // For now, we'll return the channel info
      const url = `${this.FARCASTER_RELAY_URL}/v1/channel/${channelToken}`;

      logger.info('Created Farcaster auth channel', {
        channelToken,
        domain: params.domain,
        expiresAt
      });

      return {
        channelToken,
        url,
        nonce,
        expiresAt
      };
    } catch (error) {
      logger.error('Failed to create Farcaster auth channel', error);
      throw new Error('Failed to create authentication channel');
    }
  }

  /**
   * Create a SIWE message for Farcaster authentication
   */
  createFarcasterSiweMessage(params: {
    domain: string;
    address: string;
    fid: string;
    nonce: string;
    uri: string;
  }): string {
    // Farcaster requires specific SIWE message format
    const message = siweService.createMessage({
      domain: params.domain,
      address: params.address,
      statement: 'Farcaster Auth', // Required statement
      uri: params.uri,
      chainId: 10, // Optimism Mainnet
      nonce: params.nonce,
      resources: [`farcaster://fid/${params.fid}`] // Required resource
    });

    return message;
  }

  /**
   * Check channel status and retrieve signature if available
   */
  async checkChannelStatus(channelToken: string): Promise<FarcasterAuthResponse | null> {
    try {
      const channel = await prisma.farcasterAuthChannel.findUnique({
        where: { channelToken }
      });

      if (!channel) {
        throw new Error('Channel not found');
      }

      if (channel.expiresAt < new Date()) {
        throw new Error('Channel expired');
      }

      if (channel.status === 'completed' && channel.signature) {
        return {
          signature: channel.signature,
          message: channel.message!,
          fid: channel.fid!,
          username: channel.username || undefined,
          displayName: channel.displayName || undefined,
          bio: channel.bio || undefined,
          pfpUrl: channel.pfpUrl || undefined,
          custody: channel.custody || undefined
        };
      }

      // In production, you would poll the Farcaster relay here
      // For now, return null if not completed
      return null;
    } catch (error) {
      logger.error('Failed to check channel status', error);
      throw error;
    }
  }

  /**
   * Verify Farcaster authentication
   */
  async verifyFarcasterAuth(params: {
    message: string;
    signature: string;
    expectedFid?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ valid: boolean; userData?: FarcasterUserData; error?: string }> {
    try {
      // First verify the SIWE signature
      const siweResult = await siweService.verifyMessage({
        message: params.message,
        signature: params.signature,
        expectedDomain: process.env.FRONTEND_URL?.replace(/^https?:\/\//, '') || 'interspace.so',
        expectedChainId: 10, // Optimism Mainnet
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });

      if (!siweResult.valid || !siweResult.address) {
        return { valid: false, error: siweResult.error || 'Invalid signature' };
      }

      // Parse message to extract FID from resources
      const parsedMessage = siweService.parseMessage(params.message);
      const fidResource = parsedMessage.resources?.find(r => r.startsWith('farcaster://fid/'));
      
      if (!fidResource) {
        return { valid: false, error: 'Missing Farcaster FID in message' };
      }

      const fid = fidResource.replace('farcaster://fid/', '');

      // Verify FID ownership on-chain
      const isValid = await this.verifyFidOwnership(fid, siweResult.address);
      
      if (!isValid) {
        logger.warn('FID ownership verification failed', {
          fid,
          address: siweResult.address
        });
        return { valid: false, error: 'Address does not own this FID' };
      }

      // If expected FID is provided, verify it matches
      if (params.expectedFid && fid !== params.expectedFid) {
        return { valid: false, error: 'FID mismatch' };
      }

      // Get user data from channel if available
      const channel = await prisma.farcasterAuthChannel.findFirst({
        where: {
          message: params.message,
          signature: params.signature
        }
      });

      const userData: FarcasterUserData = {
        fid,
        username: channel?.username || undefined,
        displayName: channel?.displayName || undefined,
        bio: channel?.bio || undefined,
        pfpUrl: channel?.pfpUrl || undefined,
        custody: siweResult.address,
        verifications: [siweResult.address]
      };

      logger.info('Farcaster authentication verified', {
        fid,
        address: siweResult.address,
        username: userData.username
      });

      return { valid: true, userData };
    } catch (error) {
      logger.error('Farcaster auth verification failed', error);
      return { valid: false, error: 'Verification failed' };
    }
  }

  /**
   * Verify FID ownership on Optimism chain
   */
  private async verifyFidOwnership(fid: string, address: string): Promise<boolean> {
    try {
      const provider = new ethers.JsonRpcProvider(this.OPTIMISM_RPC);
      
      // IdRegistry contract ABI (simplified)
      const idRegistryAbi = [
        'function custodyOf(uint256 fid) view returns (address)'
      ];

      const idRegistry = new ethers.Contract(
        this.ID_REGISTRY_ADDRESS,
        idRegistryAbi,
        provider
      );

      // Get custody address for FID
      // @ts-ignore - Contract method exists but TypeScript can't infer it
      const custodyAddress = await idRegistry.custodyOf(fid);
      
      // Check if the signing address matches the custody address
      const isValid = custodyAddress.toLowerCase() === address.toLowerCase();

      logger.info('FID ownership check', {
        fid,
        expectedAddress: address,
        custodyAddress,
        isValid
      });

      return isValid;
    } catch (error) {
      logger.error('Failed to verify FID ownership', error);
      return false;
    }
  }

  /**
   * Update channel with authentication response
   */
  async updateChannel(channelToken: string, authData: {
    signature: string;
    message: string;
    fid: string;
    username?: string;
    displayName?: string;
    bio?: string;
    pfpUrl?: string;
    custody?: string;
  }): Promise<void> {
    await prisma.farcasterAuthChannel.update({
      where: { channelToken },
      data: {
        signature: authData.signature,
        message: authData.message,
        fid: authData.fid,
        username: authData.username,
        displayName: authData.displayName,
        bio: authData.bio,
        pfpUrl: authData.pfpUrl,
        custody: authData.custody,
        status: 'completed',
        completedAt: new Date()
      }
    });
  }

  /**
   * Clean up expired channels
   */
  async cleanupExpiredChannels(): Promise<void> {
    await prisma.farcasterAuthChannel.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
  }
}

export const farcasterAuthService = new FarcasterAuthService();