import { Request, Response, NextFunction } from 'express';
import { siweService } from '@/services/siweService';
import { socialAuthService } from '@/services/socialAuthService';
import { config } from '@/utils/config';
import { AppError, ApiResponse } from '@/types';

export class SiweController {
  /**
   * Generate a nonce for SIWE
   */
  async generateNonce(req: Request, res: Response, next: NextFunction) {
    try {
      const nonce = await siweService.generateNonce();
      
      res.json({
        success: true,
        data: {
          nonce,
          expiresIn: 300 // 5 minutes in seconds
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a SIWE message
   */
  async createMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { address, chainId, nonce, statement, resources } = req.body;
      
      if (!address || !chainId || !nonce) {
        throw new AppError('Address, chainId, and nonce are required', 400);
      }
      
      // Get domain from request
      const domain = req.hostname || 'interspace.wallet';
      const uri = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      
      const message = siweService.createMessage({
        domain,
        address,
        statement,
        uri,
        chainId,
        nonce,
        expirationTime: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        resources
      });
      
      res.json({
        success: true,
        data: {
          message
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify a SIWE message
   */
  async verifyMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { message, signature } = req.body;
      
      if (!message || !signature) {
        throw new AppError('Message and signature are required', 400);
      }
      
      const result = await siweService.verifyMessage({
        message,
        signature,
        expectedDomain: req.hostname || 'interspace.wallet',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      if (!result.valid) {
        res.status(401).json({
          success: false,
          error: result.error || 'Invalid signature'
        });
        return;
      }
      
      res.json({
        success: true,
        data: {
          address: result.address,
          valid: true
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticate with SIWE (verify signature and generate JWT)
   */
  async authenticate(req: Request, res: Response): Promise<void> {
    try {
      const { message, signature, address, deviceId, deviceName, deviceType } = req.body;
      
      if (!message || !signature || !address) {
        res.status(400).json({
          success: false,
          error: 'Message, signature, and address are required'
        } as ApiResponse);
        return;
      }
      
      // First verify the SIWE message
      const verifyResult = await siweService.verifyMessage({
        message,
        signature,
        expectedAddress: address,
        expectedDomain: 'interspace.fi', // Accept both mobile and web domains
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      if (!verifyResult.valid) {
        res.status(401).json({
          success: false,
          error: verifyResult.error || 'Invalid SIWE signature'
        } as ApiResponse);
        return;
      }
      
      // Now authenticate the user with the verified wallet
      const tokens = await socialAuthService.authenticate({
        authToken: signature, // Use signature as auth token
        authStrategy: 'wallet',
        deviceId: deviceId || null,
        deviceName: deviceName || 'Unknown Device',
        deviceType: deviceType || 'web',
        walletAddress: verifyResult.address || address,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      
      res.status(200).json({
        success: true,
        data: tokens,
        message: 'Authentication successful'
      } as ApiResponse);
    } catch (error: any) {
      console.error('SIWE authentication error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Authentication failed'
      } as ApiResponse);
    }
  }
}

export const siweController = new SiweController();