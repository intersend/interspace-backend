const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const { prisma } = require('../utils/database');
const { logger } = require('../utils/logger');
const { emailService } = require('../services/emailService');

/**
 * Send email verification code for V2 authentication
 * Can be used both for new accounts and linking email to existing accounts
 */
const sendEmailCode = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limiting - more flexible in development
    const isDevelopment = process.env.NODE_ENV === 'development';
    const maxRequests = isDevelopment ? 10000 : 1000; // 10x more in development
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequests = await prisma.emailVerification.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: oneHourAgo }
      }
    });

    if (recentRequests >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many verification requests. Please try again later.'
      });
    }

    // Delete any existing verifications for this email
    await prisma.emailVerification.deleteMany({
      where: { email: normalizedEmail }
    });

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = await bcrypt.hash(code, 10);

    // Store verification
    await prisma.emailVerification.create({
      data: {
        email: normalizedEmail,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        attempts: 0
      }
    });

    // Send email
    await emailService.sendVerificationCode(normalizedEmail, code);

    logger.info(`Verification code sent to: ${normalizedEmail}`);

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      expiresInMinutes: 10
    });

  } catch (error) {
    logger.error('Send email code error:', error);
    next(error);
  }
};

/**
 * Resend email verification code
 */
const resendEmailCode = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if there's an active verification
    const activeVerification = await prisma.emailVerification.findFirst({
      where: {
        email: normalizedEmail,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!activeVerification) {
      return res.status(404).json({
        success: false,
        error: 'No active verification found. Please request a new code.'
      });
    }

    // Check if enough time has passed (1 minute minimum)
    const timeSinceCreation = Date.now() - activeVerification.createdAt.getTime();
    if (timeSinceCreation < 60 * 1000) {
      return res.status(429).json({
        success: false,
        error: 'Please wait before requesting a new code'
      });
    }

    // Delete old verification
    await prisma.emailVerification.delete({
      where: { id: activeVerification.id }
    });

    // Generate new code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = await bcrypt.hash(code, 10);
    
    await prisma.emailVerification.create({
      data: {
        email: normalizedEmail,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0
      }
    });

    // Send email
    await emailService.sendVerificationCode(normalizedEmail, code);

    logger.info(`Verification code resent to: ${normalizedEmail}`);

    res.json({
      success: true,
      message: 'New verification code sent to your email',
      expiresInMinutes: 10
    });

  } catch (error) {
    logger.error('Resend email code error:', error);
    next(error);
  }
};

/**
 * Verify email code without authentication
 */
const verifyEmailCode = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, code } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Find active verifications
    const verifications = await prisma.emailVerification.findMany({
      where: {
        email: normalizedEmail,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 }
      }
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
      // Increment attempts
      await prisma.emailVerification.updateMany({
        where: {
          email: normalizedEmail,
          expiresAt: { gt: new Date() }
        },
        data: {
          attempts: { increment: 1 },
          lastAttemptAt: new Date()
        }
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid or expired verification code'
      });
    }

    // Code is valid - delete verification
    await prisma.emailVerification.delete({
      where: { id: verification.id }
    });

    // Clean up other verifications
    await prisma.emailVerification.deleteMany({
      where: { email: normalizedEmail }
    });

    logger.info(`Email verified successfully: ${normalizedEmail}`);

    res.json({
      success: true,
      verified: true,
      email: normalizedEmail,
      message: 'Email verified successfully'
    });

  } catch (error) {
    logger.error('Verify email code error:', error);
    next(error);
  }
};

/**
 * Development only: Get last verification code
 */
const getLastCodeForDevelopment = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        error: 'This endpoint is only available in development'
      });
    }

    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Get last verification
    const lastVerification = await prisma.emailVerification.findFirst({
      where: {
        email: normalizedEmail,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!lastVerification) {
      return res.status(404).json({
        success: false,
        error: 'No active verification code found'
      });
    }

    // Try to get from email service
    const devCode = emailService.getDevCode && emailService.getDevCode(normalizedEmail);
    
    if (devCode) {
      return res.json({
        success: true,
        code: devCode
      });
    }
    
    res.json({
      success: true,
      message: 'Code found but hashed. Check server logs.'
    });

  } catch (error) {
    logger.error('Get dev code error:', error);
    next(error);
  }
};

module.exports = {
  sendEmailCode,
  resendEmailCode,
  verifyEmailCode,
  getLastCodeForDevelopment
};