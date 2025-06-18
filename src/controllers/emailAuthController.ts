import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../utils/database';
import { emailService } from '../services/emailService';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/errors';

// Validation schemas
const requestCodeSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

const verifyCodeSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  code: z.string().length(6),
});

// Constants
const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_MINUTES = 60;
const MAX_REQUESTS_PER_HOUR = 3;

export class EmailAuthController {
  /**
   * Request email verification code
   */
  async requestCode(req: Request, res: Response) {
    try {
      const { email } = requestCodeSchema.parse(req.body);

      // Check rate limiting
      const recentRequests = await prisma.emailVerification.count({
        where: {
          email,
          createdAt: {
            gte: new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000),
          },
        },
      });

      if (recentRequests >= MAX_REQUESTS_PER_HOUR) {
        throw new ApiError('Too many verification requests. Please try again later.', 429);
      }

      // Clean up old verification codes for this email
      await prisma.emailVerification.deleteMany({
        where: {
          email,
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      // Generate secure 6-digit code
      const code = this.generateSecureCode();
      
      // Hash the code before storing for enhanced security
      // Using bcrypt with a lower cost factor (8) for verification codes
      // since they are short-lived and we need reasonable performance
      const hashedCode = await bcrypt.hash(code, 8);
      
      // Create verification record with hashed code
      const verification = await prisma.emailVerification.create({
        data: {
          email,
          code: hashedCode,
          expiresAt: new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000),
        },
      });

      // Send email with code
      await emailService.sendVerificationCode(email, code);

      logger.info(`Verification code sent to: ${email}`);

      res.json({
        success: true,
        message: 'Verification code sent to your email',
        expiresInMinutes: CODE_EXPIRY_MINUTES,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ApiError('Invalid email address', 400);
      }
      throw error;
    }
  }

  /**
   * Verify email code
   */
  async verifyCode(req: Request, res: Response) {
    try {
      const { email, code } = verifyCodeSchema.parse(req.body);

      // Find all active verifications for this email
      const verifications = await prisma.emailVerification.findMany({
        where: {
          email,
          expiresAt: {
            gt: new Date(),
          },
          attempts: {
            lt: MAX_ATTEMPTS,
          },
        },
      });

      // Check each verification's hashed code
      let verification = null;
      for (const v of verifications) {
        const isValidCode = await bcrypt.compare(code, v.code);
        if (isValidCode) {
          verification = v;
          break;
        }
      }

      if (!verification) {
        // Increment attempts on any active verification for this email
        await prisma.emailVerification.updateMany({
          where: {
            email,
            expiresAt: {
              gt: new Date(),
            },
          },
          data: {
            attempts: {
              increment: 1,
            },
            lastAttemptAt: new Date(),
          },
        });

        throw new ApiError('Invalid or expired verification code', 401);
      }

      // Code is valid - delete the verification
      await prisma.emailVerification.delete({
        where: {
          id: verification.id,
        },
      });

      // Clean up other verifications for this email
      await prisma.emailVerification.deleteMany({
        where: {
          email,
        },
      });

      // Create or update user with verified email
      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Create new user with verified email
        user = await prisma.user.create({
          data: {
            email,
            emailVerified: true,
            authStrategies: JSON.stringify(['email']),
            isGuest: false,
          },
        });
      } else {
        // Update existing user to mark email as verified
        const currentStrategies = JSON.parse(user.authStrategies || '[]');
        if (!currentStrategies.includes('email')) {
          currentStrategies.push('email');
        }
        
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerified: true,
            authStrategies: JSON.stringify(currentStrategies),
            isGuest: false,
          },
        });
      }

      logger.info(`Email verified successfully: ${email}`);

      // Return success - user can now authenticate with email
      res.json({
        success: true,
        message: 'Email verified successfully',
        email,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ApiError('Invalid email or code format', 400);
      }
      throw error;
    }
  }

  /**
   * Resend verification code
   */
  async resendCode(req: Request, res: Response) {
    try {
      const { email } = requestCodeSchema.parse(req.body);

      // Check if there's an active verification
      const activeVerification = await prisma.emailVerification.findFirst({
        where: {
          email,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!activeVerification) {
        throw new ApiError('No active verification found. Please request a new code.', 404);
      }

      // Check if enough time has passed since last code
      const timeSinceCreation = Date.now() - activeVerification.createdAt.getTime();
      const minimumResendInterval = 60 * 1000; // 1 minute

      if (timeSinceCreation < minimumResendInterval) {
        throw new ApiError('Please wait before requesting a new code', 429);
      }

      // Delete old verification
      await prisma.emailVerification.delete({
        where: {
          id: activeVerification.id,
        },
      });

      // Create new verification
      const code = this.generateSecureCode();
      const hashedCode = await bcrypt.hash(code, 8);
      
      await prisma.emailVerification.create({
        data: {
          email,
          code: hashedCode,
          expiresAt: new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000),
        },
      });

      // Send email with new code
      await emailService.sendVerificationCode(email, code);

      logger.info(`Verification code resent to: ${email}`);

      res.json({
        success: true,
        message: 'New verification code sent to your email',
        expiresInMinutes: CODE_EXPIRY_MINUTES,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ApiError('Invalid email address', 400);
      }
      throw error;
    }
  }

  /**
   * Generate cryptographically secure 6-digit code
   */
  private generateSecureCode(): string {
    const min = 100000;
    const max = 999999;
    const randomInt = crypto.randomInt(min, max + 1);
    return randomInt.toString();
  }

  /**
   * Development only: Get last verification code for an email
   * This endpoint should NEVER be exposed in production
   */
  async getLastCodeForDevelopment(req: Request, res: Response) {
    try {
      // Only allow in development environment
      if (process.env.NODE_ENV !== 'development') {
        throw new ApiError('This endpoint is only available in development', 403);
      }

      const { email } = req.query;
      
      if (!email || typeof email !== 'string') {
        throw new ApiError('Email is required', 400);
      }

      // Get the last verification code for this email
      const lastVerification = await prisma.emailVerification.findFirst({
        where: {
          email,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!lastVerification) {
        return res.status(404).json({
          success: false,
          message: 'No active verification code found for this email',
        });
      }

      // Try to get the code from the email service (development only)
      const devCode = emailService.getDevCode(email);
      
      if (devCode) {
        return res.json({
          success: true,
          code: devCode,
          message: 'Development mode: Actual verification code returned',
        });
      }
      
      // Fallback message
      return res.json({
        success: true,
        message: 'Code found but hashed. Check server logs for the actual code.',
        hint: 'Look for the log message with the verification code in your terminal',
      });
    } catch (error) {
      throw error;
    }
  }

}

export const emailAuthController = new EmailAuthController();