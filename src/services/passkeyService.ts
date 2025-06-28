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
  accountId: string; // Changed from userId to accountId for V2
  username: string;
  displayName?: string;
  deviceName?: string;
}

interface PasskeyAuthenticationOptions {
  accountId?: string;
  username?: string;
}

class PasskeyService {
  private readonly rpName = 'Interspace';
  private readonly rpID = config.PASSKEY_RP_ID || 'interspace.app';
  private readonly origin = config.PASSKEY_ORIGIN || 'https://interspace.app';

  constructor() {
    if (!config.PASSKEY_RP_ID) {
      console.warn('⚠️ PASSKEY_RP_ID not configured, using default: interspace.app');
    }
    if (!config.PASSKEY_ORIGIN) {
      console.warn('⚠️ PASSKEY_ORIGIN not configured, using default: https://interspace.app');
    }
    console.log(`🔐 PasskeyService initialized with RP ID: ${this.rpID}, Origin: ${this.origin}`);
  }

  /**
   * Generate registration options for creating a new passkey
   */
  async generateRegistrationOptions(options: PasskeyRegistrationOptions): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const { accountId, username, displayName, deviceName } = options;

    // Get existing passkey accounts linked to this account to exclude
    const linkedAccounts = await prisma.identityLink.findMany({
      where: {
        OR: [
          { accountAId: accountId },
          { accountBId: accountId }
        ]
      },
      include: {
        accountA: true,
        accountB: true
      }
    });

    // Extract passkey accounts
    const passkeyAccounts: any[] = [];
    linkedAccounts.forEach(link => {
      if (link.accountA.type === 'passkey' && link.accountA.id !== accountId) {
        passkeyAccounts.push(link.accountA);
      }
      if (link.accountB.type === 'passkey' && link.accountB.id !== accountId) {
        passkeyAccounts.push(link.accountB);
      }
    });

    // Also check if the current account itself is a passkey
    const currentAccount = await prisma.account.findUnique({
      where: { id: accountId }
    });
    if (currentAccount?.type === 'passkey') {
      passkeyAccounts.push(currentAccount);
    }

    const excludeCredentials = passkeyAccounts.map(account => ({
      id: account.identifier,
      transports: (account.metadata as any)?.transports || []
    }));

    const challenge = challengeService.generateChallenge(accountId, 'registration');

    const registrationOptions = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(accountId),
      userName: username,
      userDisplayName: displayName || username,
      challenge,
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        requireResidentKey: false,
        residentKey: 'preferred',
        userVerification: 'preferred'
      },
      supportedAlgorithmIDs: [-7, -257], // ES256, RS256
      timeout: 60000,
      attestationType: 'none'
    });

    return registrationOptions;
  }

  /**
   * Verify registration response and store the credential
   */
  async verifyRegistration(
    response: any,
    expectedChallenge: string,
    options: PasskeyRegistrationOptions
  ): Promise<{ verified: boolean; credentialId?: string }> {
    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: false
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new AuthenticationError('Passkey registration failed');
      }

      const { credential: verifiedCredential, credentialType } = verification.registrationInfo;
      const { id: credentialID, publicKey: credentialPublicKey, counter } = verifiedCredential;
      const credentialData = {
        id: Buffer.from(credentialID).toString('base64url'),
        publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
        counter
      };

      // Log for debugging
      console.log(`📝 Storing passkey credential: ${credentialData.id} (length: ${credentialData.id.length})`);

      // Store as an Account in V2 model
      await withTransaction(async (tx) => {
        // Create the passkey account
        await tx.account.create({
          data: {
            type: 'passkey',
            identifier: credentialData.id,
            verified: true,
            metadata: {
              publicKey: credentialData.publicKey,
              username: options.username,
              counter: credentialData.counter,
              deviceName: options.deviceName || 'Unknown Device',
              transports: response.transports || [],
              createdAt: new Date().toISOString()
            }
          }
        });
      });

      return {
        verified: true,
        credentialId: credentialData.id
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
    const { accountId, username } = options;

    let allowCredentials: any[] = [];

    if (accountId) {
      // Get passkey accounts linked to this account
      const linkedAccounts = await prisma.identityLink.findMany({
        where: {
          OR: [
            { accountAId: accountId },
            { accountBId: accountId }
          ]
        },
        include: {
          accountA: true,
          accountB: true
        }
      });

      // Extract passkey accounts
      linkedAccounts.forEach(link => {
        if (link.accountA.type === 'passkey') {
          allowCredentials.push({
            id: link.accountA.identifier,
            transports: (link.accountA.metadata as any)?.transports || undefined
          });
        }
        if (link.accountB.type === 'passkey') {
          allowCredentials.push({
            id: link.accountB.identifier,
            transports: (link.accountB.metadata as any)?.transports || undefined
          });
        }
      });
    } else if (username) {
      // Find passkey accounts by username in metadata
      const passkeyAccounts = await prisma.account.findMany({
        where: {
          type: 'passkey',
          metadata: {
            path: ['username'],
            equals: username
          }
        }
      });

      allowCredentials = passkeyAccounts.map(account => ({
        id: account.identifier,
        transports: (account.metadata as any)?.transports || undefined
      }));
    }

    const challenge = challengeService.generateChallenge(accountId, 'authentication');

    const authenticationOptions = await generateAuthenticationOptions({
      rpID: this.rpID,
      challenge,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: 'preferred',
      timeout: 60000
    });

    return authenticationOptions;
  }

  /**
   * Verify authentication response
   */
  async verifyAuthentication(
    response: any,
    expectedChallenge: string
  ): Promise<{ verified: boolean; accountId?: string; credentialId?: string }> {
    try {
      console.log(`🔐 Passkey authentication attempt with credential: ${response.id} (length: ${response.id?.length})`);

      // The response.id and response.rawId are base64url encoded strings
      // We need to use the same format that was stored during registration
      const credentialId = response.id;

      // First, find the credential account
      // Note: Passkey credential IDs are case-sensitive base64url strings
      const account = await prisma.account.findUnique({
        where: {
          type_identifier: {
            type: 'passkey',
            identifier: credentialId
          }
        }
      });

      if (!account) {
        // Debug: check if it's a case sensitivity issue
        const passkeyAccounts = await prisma.account.findMany({
          where: { type: 'passkey' },
          select: { identifier: true }
        });
        
        const matchingAccount = passkeyAccounts.find(a => 
          a.identifier.toLowerCase() === response.id.toLowerCase()
        );
        
        if (matchingAccount) {
          throw new AuthenticationError(`Credential found but with different case. Expected: ${matchingAccount.identifier}, Got: ${response.id}`);
        }
        
        throw new AuthenticationError(`Credential not found: ${response.id}`);
      }

      // Extract credential data from metadata
      const metadata = account.metadata as any;
      if (!metadata?.publicKey) {
        throw new AuthenticationError('Invalid credential data');
      }

      // Verify the challenge (V2 doesn't tie challenges to userId)
      if (!challengeService.verifyChallenge(expectedChallenge, account.id, 'authentication')) {
        throw new AuthenticationError('Invalid or expired challenge');
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: account.identifier,
          publicKey: Buffer.from(metadata.publicKey, 'base64url'),
          counter: metadata.counter || 0,
          transports: metadata.transports || undefined
        },
        requireUserVerification: false
      });

      if (!verification.verified) {
        throw new AuthenticationError('Authentication failed');
      }

      // Update counter and last used
      await prisma.account.update({
        where: { id: account.id },
        data: {
          metadata: {
            ...metadata,
            counter: verification.authenticationInfo.newCounter,
            lastUsedAt: new Date().toISOString()
          }
        }
      });

      // Find the primary account this passkey is linked to
      const identityLink = await prisma.identityLink.findFirst({
        where: {
          OR: [
            { accountAId: account.id },
            { accountBId: account.id }
          ]
        },
        include: {
          accountA: true,
          accountB: true
        }
      });

      let primaryAccountId = account.id;
      if (identityLink) {
        // Return the non-passkey account as the primary
        if (identityLink.accountA.id === account.id && identityLink.accountB.type !== 'passkey') {
          primaryAccountId = identityLink.accountB.id;
        } else if (identityLink.accountB.id === account.id && identityLink.accountA.type !== 'passkey') {
          primaryAccountId = identityLink.accountA.id;
        }
      }

      return {
        verified: true,
        accountId: primaryAccountId,
        credentialId: account.identifier
      };
    } catch (error) {
      console.error('Passkey authentication error:', error);
      throw error;
    }
  }
}

export const passkeyService = new PasskeyService();