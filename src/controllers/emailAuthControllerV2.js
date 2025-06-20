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

    // Check rate limiting (3 requests per hour per email)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequests = await prisma.emailVerification.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: oneHourAgo }
      }
    });

    if (recentRequests >= 3) {
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

module.exports = {
  sendEmailCode
};