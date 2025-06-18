import { ethers } from 'ethers';
import { prisma } from '@/utils/database';
import { auditService } from './auditService';
import { AuthenticationError } from '@/types';
import crypto from 'crypto';

interface SiweMessage {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

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
    const siweMessage: SiweMessage = {
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
    };

    // Format according to EIP-4361
    let message = `${siweMessage.domain} wants you to sign in with your Ethereum account:\n`;
    message += `${siweMessage.address}\n\n`;
    
    if (siweMessage.statement) {
      message += `${siweMessage.statement}\n\n`;
    }
    
    message += `URI: ${siweMessage.uri}\n`;
    message += `Version: ${siweMessage.version}\n`;
    message += `Chain ID: ${siweMessage.chainId}\n`;
    message += `Nonce: ${siweMessage.nonce}\n`;
    message += `Issued At: ${siweMessage.issuedAt}`;
    
    if (siweMessage.expirationTime) {
      message += `\nExpiration Time: ${siweMessage.expirationTime}`;
    }
    
    if (siweMessage.notBefore) {
      message += `\nNot Before: ${siweMessage.notBefore}`;
    }
    
    if (siweMessage.requestId) {
      message += `\nRequest ID: ${siweMessage.requestId}`;
    }
    
    if (siweMessage.resources && siweMessage.resources.length > 0) {
      message += '\nResources:';
      siweMessage.resources.forEach(resource => {
        message += `\n- ${resource}`;
      });
    }
    
    return message;
  }

  /**
   * Parse a SIWE message
   */
  parseMessage(message: string): SiweMessage {
    const lines = message.split('\n');
    const parsed: Partial<SiweMessage> = {};
    
    // Parse domain and address from first lines
    const domainMatch = lines[0]?.match(/^(.+) wants you to sign in with your Ethereum account:$/);
    if (domainMatch) {
      parsed.domain = domainMatch[1];
    }
    
    parsed.address = lines[1];
    
    // Find statement (everything between address and URI)
    let statementEnd = lines.findIndex(line => line.startsWith('URI:'));
    if (statementEnd > 3) {
      parsed.statement = lines.slice(3, statementEnd - 1).join('\n');
    }
    
    // Parse fields
    lines.forEach(line => {
      if (line.startsWith('URI:')) {
        parsed.uri = line.substring(5).trim();
      } else if (line.startsWith('Version:')) {
        parsed.version = line.substring(9).trim();
      } else if (line.startsWith('Chain ID:')) {
        parsed.chainId = parseInt(line.substring(10).trim());
      } else if (line.startsWith('Nonce:')) {
        parsed.nonce = line.substring(7).trim();
      } else if (line.startsWith('Issued At:')) {
        parsed.issuedAt = line.substring(11).trim();
      } else if (line.startsWith('Expiration Time:')) {
        parsed.expirationTime = line.substring(17).trim();
      } else if (line.startsWith('Not Before:')) {
        parsed.notBefore = line.substring(12).trim();
      } else if (line.startsWith('Request ID:')) {
        parsed.requestId = line.substring(12).trim();
      }
    });
    
    // Parse resources
    const resourcesIndex = lines.findIndex(line => line === 'Resources:');
    if (resourcesIndex !== -1) {
      parsed.resources = lines
        .slice(resourcesIndex + 1)
        .filter(line => line.startsWith('- '))
        .map(line => line.substring(2));
    }
    
    return parsed as SiweMessage;
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
      // Parse the message
      const parsedMessage = this.parseMessage(params.message);
      
      // Verify signature
      const recoveredAddress = ethers.verifyMessage(params.message, params.signature);
      
      // Check address matches
      if (recoveredAddress.toLowerCase() !== parsedMessage.address.toLowerCase()) {
        await auditService.logSecurityEvent({
          type: 'INVALID_TOKEN',
          details: { 
            reason: 'SIWE address mismatch',
            recovered: recoveredAddress,
            expected: parsedMessage.address 
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        });
        return { valid: false, error: 'Address mismatch' };
      }
      
      // Verify expected address if provided
      if (params.expectedAddress && 
          recoveredAddress.toLowerCase() !== params.expectedAddress.toLowerCase()) {
        return { valid: false, error: 'Unexpected address' };
      }
      
      // Verify domain
      if (params.expectedDomain && parsedMessage.domain !== params.expectedDomain) {
        await auditService.logSecurityEvent({
          type: 'INVALID_TOKEN',
          details: { 
            reason: 'SIWE domain mismatch',
            domain: parsedMessage.domain,
            expected: params.expectedDomain
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        });
        return { valid: false, error: 'Domain mismatch' };
      }
      
      // Verify chain ID
      if (params.expectedChainId && parsedMessage.chainId !== params.expectedChainId) {
        return { valid: false, error: 'Chain ID mismatch' };
      }
      
      // Verify nonce (prevent replay attacks)
      const nonceRecord = await prisma.siweNonce.findUnique({
        where: { nonce: parsedMessage.nonce }
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
            nonce: parsedMessage.nonce,
            address: recoveredAddress
          },
          ipAddress: params.ipAddress,
          userAgent: params.userAgent
        });
        return { valid: false, error: 'Nonce already used' };
      }
      
      // Check message timestamp
      const issuedAt = new Date(parsedMessage.issuedAt);
      const now = new Date();
      
      if (issuedAt > now) {
        return { valid: false, error: 'Message issued in the future' };
      }
      
      if (now.getTime() - issuedAt.getTime() > this.MESSAGE_EXPIRY_MS) {
        return { valid: false, error: 'Message expired' };
      }
      
      // Check expiration time if provided
      if (parsedMessage.expirationTime) {
        const expirationTime = new Date(parsedMessage.expirationTime);
        if (now > expirationTime) {
          return { valid: false, error: 'Message expired' };
        }
      }
      
      // Check not before time if provided
      if (parsedMessage.notBefore) {
        const notBefore = new Date(parsedMessage.notBefore);
        if (now < notBefore) {
          return { valid: false, error: 'Message not yet valid' };
        }
      }
      
      // Mark nonce as used
      await prisma.siweNonce.update({
        where: { nonce: parsedMessage.nonce },
        data: { usedAt: new Date() }
      });
      
      // Log successful verification
      await auditService.log({
        action: 'SIWE_VERIFIED',
        resource: 'Authentication',
        details: JSON.stringify({
          address: recoveredAddress,
          domain: parsedMessage.domain,
          chainId: parsedMessage.chainId
        }),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      });
      
      return { valid: true, address: recoveredAddress };
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