import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../utils/database';
import { emailService } from '../../services/emailService';
import { EmailAuthController } from '../emailAuthController';
import { ApiError } from '../../utils/errors';

// Mock dependencies
jest.mock('../../utils/database', () => ({
  prisma: {
    emailVerification: {
      count: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../services/emailService', () => ({
  emailService: {
    sendVerificationCode: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('EmailAuthController', () => {
  let controller: EmailAuthController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    controller = new EmailAuthController();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
    mockRequest = {
      body: {},
    };
    mockResponse = {
      json: mockJson,
      status: mockStatus,
    };
    jest.clearAllMocks();
  });

  describe('requestCode', () => {
    it('should hash the verification code before storing', async () => {
      const email = 'test@example.com';
      mockRequest.body = { email };

      (prisma.emailVerification.count as jest.Mock).mockResolvedValue(0);
      (prisma.emailVerification.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.emailVerification.create as jest.Mock).mockImplementation(async ({ data }) => {
        // Verify that the code is hashed
        expect(data.code).not.toMatch(/^\d{6}$/); // Should not be a plain 6-digit code
        expect(data.code.length).toBeGreaterThan(6); // Hashed code is longer
        
        // Verify it's a valid bcrypt hash
        const isValidHash = data.code.startsWith('$2a$') || data.code.startsWith('$2b$');
        expect(isValidHash).toBe(true);
        
        return {
          id: 'test-id',
          email: data.email,
          code: data.code,
          expiresAt: data.expiresAt,
          attempts: 0,
          createdAt: new Date(),
        };
      });

      await controller.requestCode(mockRequest as Request, mockResponse as Response);

      expect(prisma.emailVerification.create).toHaveBeenCalled();
      expect(emailService.sendVerificationCode).toHaveBeenCalledWith(
        email,
        expect.stringMatching(/^\d{6}$/) // Original code sent to email should be 6 digits
      );
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Verification code sent to your email',
        expiresInMinutes: 10,
      });
    });
  });

  describe('verifyCode', () => {
    it('should verify against hashed code', async () => {
      const email = 'test@example.com';
      const plainCode = '123456';
      const hashedCode = await bcrypt.hash(plainCode, 8);
      
      mockRequest.body = { email, code: plainCode };

      const mockVerification = {
        id: 'test-id',
        email,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      };

      (prisma.emailVerification.findMany as jest.Mock).mockResolvedValue([mockVerification]);
      (prisma.emailVerification.delete as jest.Mock).mockResolvedValue(mockVerification);
      (prisma.emailVerification.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-id',
        email,
        emailVerified: true,
        authStrategies: JSON.stringify(['email']),
        isGuest: false,
      });

      await controller.verifyCode(mockRequest as Request, mockResponse as Response);

      expect(prisma.emailVerification.findMany).toHaveBeenCalledWith({
        where: {
          email,
          expiresAt: { gt: expect.any(Date) },
          attempts: { lt: 5 },
        },
      });
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        message: 'Email verified successfully',
        email,
      });
    });

    it('should reject invalid code', async () => {
      const email = 'test@example.com';
      const plainCode = '123456';
      const wrongCode = '654321';
      const hashedCode = await bcrypt.hash(plainCode, 8);
      
      mockRequest.body = { email, code: wrongCode };

      const mockVerification = {
        id: 'test-id',
        email,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      };

      (prisma.emailVerification.findMany as jest.Mock).mockResolvedValue([mockVerification]);
      (prisma.emailVerification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await expect(
        controller.verifyCode(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(new ApiError('Invalid or expired verification code', 401));

      expect(prisma.emailVerification.updateMany).toHaveBeenCalled();
    });
  });
});