import { SiweMessage } from 'siwe';
import { prisma } from '@/utils/database';
import { auditService } from './auditService';
import { AuthenticationError } from '@/types';
import crypto from 'crypto';

export class SiweService {
  private readonly NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MESSAGE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Generate a unique nonce for SIWE
   */
  async generateNonce(): Promise<string> {
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Store nonce with expiration
    await prisma.siweNonce.create({
      data: {
        nonce,
        expiresAt: new Date(Date.now() + this.NONCE_EXPIRY_MS)
      }
    });
    
    return nonce;
  }

  /**
   * Create a SIWE message following EIP-4361
   */
  createMessage(params: {
    domain: string;
    address: string;
    statement?: string;
    uri: string;
    chainId: number;
    nonce: string;
    expirationTime?: Date;
    resources?: string[];
  }): string {
    const siweMessage = new SiweMessage({
      domain: params.domain,
      address: params.address,
      statement: params.statement || `Sign in with Ethereum to ${params.domain}`,
      uri: params.uri,
      version: '1',
      chainId: params.chainId,
      nonce: params.nonce,
      issuedAt: new Date().toISOString(),
      expirationTime: params.expirationTime?.toISOString(),
      resources: params.resources
    });

    // Use the built-in prepareMessage method
    return siweMessage.prepareMessage();
  }

  /**
   * Parse a SIWE message
   */
  parseMessage(message: string): SiweMessage {
    // Use the siwe library's built-in parser
    return new SiweMessage(message);
  }

  /**
   * Verify a SIWE message and signature
   */
  async verifyMessage(params: {
    message: string;
    signature: string;
    expectedAddress?: string;
    expectedDomain?: string;
    expectedChainId?: number;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ valid: boolean; address?: string; error?: string }> {
    try {
      // Parse and verify the message using siwe library
      const siweMessage = new SiweMessage(params.message);
      const { success, error } = await siweMessage.verify({
        signature: params.signature,
        domain: params.expectedDomain
      });
      
      if (!success || error) {
        await auditService.logSecurityEvent({
          type: 'INVALID_TOKEN',
          details: { 
            reason: 'SIWE verification failed',
            error: error?.type || 'Unknown error'
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        });
        return { valid: false, error: error?.type || 'Verification failed' };
      }
      
      // Verify expected address if provided
      if (params.expectedAddress && 
          siweMessage.address.toLowerCase() !== params.expectedAddress.toLowerCase()) {
        return { valid: false, error: 'Unexpected address' };
      }
      
      // Domain is already verified by siwe.verify()
      
      // Verify chain ID
      if (params.expectedChainId && siweMessage.chainId !== params.expectedChainId) {
        await auditService.logSecurityEvent({
          type: 'INVALID_TOKEN',
          details: { 
            reason: 'SIWE chain ID mismatch',
            chainId: siweMessage.chainId,
            expected: params.expectedChainId
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        });
        return { valid: false, error: 'Chain ID mismatch' };
      }
      
      // Verify nonce (prevent replay attacks)
      const nonceRecord = await prisma.siweNonce.findUnique({
        where: { nonce: siweMessage.nonce }
      });
      
      if (!nonceRecord) {
        await auditService.logSecurityEvent({
          type: 'INVALID_TOKEN',
          details: { reason: 'SIWE invalid nonce' },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        });
        return { valid: false, error: 'Invalid nonce' };
      }
      
      // Check if nonce is expired
      if (nonceRecord.expiresAt < new Date()) {
        await auditService.logSecurityEvent({
          type: 'INVALID_TOKEN',
          details: { reason: 'SIWE expired nonce' },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        });
        return { valid: false, error: 'Expired nonce' };
      }
      
      // Check if nonce was already used
      if (nonceRecord.usedAt) {
        await auditService.logSecurityEvent({
          type: 'SUSPICIOUS_ACTIVITY',
          details: { 
            reason: 'SIWE nonce replay attempt',
            nonce: siweMessage.nonce,
            address: siweMessage.address
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        });
        return { valid: false, error: 'Nonce already used' };
      }
      
      // Check message timestamp
      if (!siweMessage.issuedAt) {
        return { valid: false, error: 'Message missing issued timestamp' };
      }
      
      const issuedAt = new Date(siweMessage.issuedAt);
      const now = new Date();
      
      if (issuedAt > now) {
        return { valid: false, error: 'Message issued in the future' };
      }
      
      if (now.getTime() - issuedAt.getTime() > this.MESSAGE_EXPIRY_MS) {
        return { valid: false, error: 'Message expired' };
      }
      
      // Check expiration time if provided
      if (siweMessage.expirationTime) {
        const expirationTime = new Date(siweMessage.expirationTime);
        if (now > expirationTime) {
          return { valid: false, error: 'Message expired' };
        }
      }
      
      // Check not before time if provided
      if (siweMessage.notBefore) {
        const notBefore = new Date(siweMessage.notBefore);
        if (now < notBefore) {
          return { valid: false, error: 'Message not yet valid' };
        }
      }
      
      // Mark nonce as used
      await prisma.siweNonce.update({
        where: { nonce: siweMessage.nonce },
        data: { usedAt: new Date() }
      });
      
      // Log successful verification
      await auditService.log({
        action: 'SIWE_VERIFIED',
        resource: 'Authentication',
        details: JSON.stringify({
          address: siweMessage.address,
          domain: siweMessage.domain,
          chainId: siweMessage.chainId
        }),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });
      
      return { valid: true, address: siweMessage.address };
    } catch (error: any) {
      await auditService.logSecurityEvent({
        type: 'INVALID_TOKEN',
        details: { 
          reason: 'SIWE verification error',
          error: error.message 
        },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });
      return { valid: false, error: error.message };
    }
  }

  /**
   * Clean up expired nonces
   */
  async cleanupExpiredNonces(): Promise<void> {
    await prisma.siweNonce.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
  }
}

export const siweService = new SiweService();