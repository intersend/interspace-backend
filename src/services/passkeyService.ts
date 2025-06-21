import { 
  generateRegistrationOptions,
  verifyRegistrationResponse, 
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse
} from '@simplewebauthn/server';
import { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/types';
import { prisma, withTransaction } from '@/utils/database';
import { challengeService } from './challengeService';
import { config } from '@/utils/config';
import { AuthenticationError, NotFoundError } from '@/types';

interface PasskeyRegistrationOptions {
  userId: string;
  username: string;
  displayName?: string;
  deviceName?: string;
}

interface PasskeyAuthenticationOptions {
  userId?: string;
  username?: string;
}

class PasskeyService {
  private readonly rpName = 'Interspace';
  private readonly rpID = config.PASSKEY_RP_ID || 'interspace.com';
  private readonly origin = config.PASSKEY_ORIGIN || 'https://interspace.com';

  /**
   * Generate registration options for creating a new passkey
   */
  async generateRegistrationOptions(options: PasskeyRegistrationOptions): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const { userId, username, displayName, deviceName } = options;

    // Get existing credentials for this user to exclude
    const existingCredentials = await prisma.passkeyCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true }
    });

    const excludeCredentials = existingCredentials.map(cred => ({
      id: Buffer.from(cred.credentialId, 'base64url'),
      type: 'public-key' as const,
      transports: cred.transports ? JSON.parse(cred.transports) : undefined
    }));

    // Generate a challenge
    const challenge = challengeService.generateChallenge(userId, 'registration');

    const registrationOptions = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(userId),
      userName: username,
      userDisplayName: displayName || username,
      challenge,
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred',
        requireResidentKey: false
      },
      supportedAlgorithmIDs: [-7, -257], // ES256, RS256
      timeout: 60000 // 60 seconds
    });

    return registrationOptions;
  }

  /**
   * Verify registration response and save credential
   */
  async verifyRegistration(
    userId: string,
    response: any,
    expectedChallenge: string,
    deviceName?: string
  ): Promise<{ verified: boolean; credentialId?: string }> {
    try {
      // Verify the challenge
      if (!challengeService.verifyChallenge(expectedChallenge, userId, 'registration')) {
        throw new AuthenticationError('Invalid or expired challenge');
      }

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: false
      });

      if (!verification.verified || !verification.registrationInfo) {
        return { verified: false };
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      // Save credential to database
      await withTransaction(async (tx) => {
        // Check if user exists
        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (!user) {
          throw new NotFoundError('User');
        }

        // Save passkey credential
        await tx.passkeyCredential.create({
          data: {
            userId,
            credentialId: credential.id,
            publicKey: Buffer.from(credential.publicKey).toString('base64url'),
            username: user.email || 'user',
            counter: credential.counter,
            deviceName: deviceName || credentialDeviceType || 'Unknown Device',
            transports: JSON.stringify(response.transports || [])
          }
        });
      });

      return {
        verified: true,
        credentialId: credential.id
      };
    } catch (error) {
      console.error('Passkey registration error:', error);
      throw error;
    }
  }

  /**
   * Generate authentication options for signing in with a passkey
   */
  async generateAuthenticationOptions(options: PasskeyAuthenticationOptions = {}): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const { userId, username } = options;

    let allowCredentials: any[] = [];

    if (userId) {
      // Get credentials for specific user
      const userCredentials = await prisma.passkeyCredential.findMany({
        where: { userId },
        select: { credentialId: true, transports: true }
      });

      allowCredentials = userCredentials.map(cred => ({
        id: Buffer.from(cred.credentialId, 'base64url'),
        type: 'public-key' as const,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined
      }));
    } else if (username) {
      // Get credentials by username (email)
      const userCredentials = await prisma.passkeyCredential.findMany({
        where: { username },
        select: { credentialId: true, transports: true }
      });

      allowCredentials = userCredentials.map(cred => ({
        id: Buffer.from(cred.credentialId, 'base64url'),
        type: 'public-key' as const,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined
      }));
    }

    // Generate a challenge
    const challenge = challengeService.generateChallenge(userId, 'authentication');

    const authenticationOptions = await generateAuthenticationOptions({
      rpID: this.rpID,
      challenge,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: 'preferred',
      timeout: 60000 // 60 seconds
    });

    return authenticationOptions;
  }

  /**
   * Verify authentication response
   */
  async verifyAuthentication(
    response: any,
    expectedChallenge: string
  ): Promise<{ verified: boolean; userId?: string; credentialId?: string }> {
    try {
      // First, find the credential
      const credential = await prisma.passkeyCredential.findUnique({
        where: { credentialId: response.id },
        include: { user: true }
      });

      if (!credential) {
        throw new AuthenticationError('Credential not found');
      }

      // Verify the challenge
      if (!challengeService.verifyChallenge(expectedChallenge, credential.userId, 'authentication')) {
        throw new AuthenticationError('Invalid or expired challenge');
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: credential.credentialId,
          publicKey: Buffer.from(credential.publicKey, 'base64url'),
          counter: credential.counter,
          transports: credential.transports ? JSON.parse(credential.transports) : undefined
        },
        requireUserVerification: false
      });

      if (!verification.verified || !verification.authenticationInfo) {
        return { verified: false };
      }

      // Update credential counter and last used
      await prisma.passkeyCredential.update({
        where: { credentialId: credential.credentialId },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date()
        }
      });

      return {
        verified: true,
        userId: credential.userId,
        credentialId: credential.credentialId
      };
    } catch (error) {
      console.error('Passkey authentication error:', error);
      throw error;
    }
  }

  /**
   * Get all passkeys for a user
   */
  async getUserPasskeys(userId: string) {
    return prisma.passkeyCredential.findMany({
      where: { userId },
      select: {
        id: true,
        credentialId: true,
        deviceName: true,
        createdAt: true,
        lastUsedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Delete a passkey
   */
  async deletePasskey(userId: string, credentialId: string) {
    const credential = await prisma.passkeyCredential.findFirst({
      where: {
        credentialId,
        userId
      }
    });

    if (!credential) {
      throw new NotFoundError('Passkey credential');
    }

    await prisma.passkeyCredential.delete({
      where: { id: credential.id }
    });
  }
}

export const passkeyService = new PasskeyService();
