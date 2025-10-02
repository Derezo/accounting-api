import { prisma } from '../../src/config/database';

// Mock dependencies
jest.mock('../../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn()
    }
  }
}));

// Mock email service - must be defined before PasswordService import
const mockSendEmail = jest.fn();
jest.mock('../../src/services/email.service', () => {
  return {
    EmailService: jest.fn().mockImplementation(() => ({
      sendEmail: (...args: any[]) => mockSendEmail(...args)
    }))
  };
});

jest.mock('../../src/utils/crypto', () => ({
  hashPassword: jest.fn((pwd: string) => Promise.resolve(`hashed_${pwd}`)),
  verifyPassword: jest.fn(() => Promise.resolve(true)),
  generateRandomToken: jest.fn(() => 'mock-token-12345678901234567890123456789012')
}));

// Import after all mocks are set up
import { PasswordService } from '../../src/services/auth/password.service';

describe('PasswordService - Security Fixes', () => {
  let passwordService: PasswordService;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEmail.mockClear();
    passwordService = new PasswordService();
    mockPrisma = prisma as any;
  });

  describe('requestPasswordReset - Security Fix', () => {
    const validUser = {
      id: 'user-123',
      email: 'test@example.com',
      isActive: true,
      firstName: 'John',
      lastName: 'Doe'
    };

    beforeEach(() => {
      mockSendEmail.mockResolvedValue(undefined);
    });

    it('should send password reset via email and NOT return the token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      mockPrisma.user.update.mockResolvedValue({});

      const result = await passwordService.requestPasswordReset({
        email: 'test@example.com',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      // SECURITY CHECK: Token should NEVER be in the response
      expect(result).not.toContain('mock-token');
      expect(result).toBe('If an account with that email exists, a password reset link has been sent');
    });

    it('should send email with reset link containing token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      mockPrisma.user.update.mockResolvedValue({});

      await passwordService.requestPasswordReset({
        email: 'test@example.com'
      });

      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Reset Your Password - Lifestream Dynamics',
        expect.stringContaining('mock-token-12345678901234567890123456789012'),
        expect.stringContaining('mock-token-12345678901234567890123456789012')
      );
    });

    it('should include user first name in email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      mockPrisma.user.update.mockResolvedValue({});

      await passwordService.requestPasswordReset({
        email: 'test@example.com'
      });

      const emailHtml = mockSendEmail.mock.calls[0][2];
      expect(emailHtml).toContain('Hi John');
    });

    it('should include security warnings in email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      mockPrisma.user.update.mockResolvedValue({});

      await passwordService.requestPasswordReset({
        email: 'test@example.com'
      });

      const emailHtml = mockSendEmail.mock.calls[0][2];
      const emailText = mockSendEmail.mock.calls[0][3];

      expect(emailHtml).toContain('This link will expire in 1 hour');
      expect(emailHtml).toContain('Never share this link with anyone');
      expect(emailText).toContain('This link will expire in 1 hour');
      expect(emailText).toContain('Never share this link with anyone');
    });

    it('should return same message for non-existent user (security)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await passwordService.requestPasswordReset({
        email: 'nonexistent@example.com'
      });

      expect(result).toBe('If an account with that email exists, a password reset link has been sent');
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should return same message for inactive user (security)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...validUser,
        isActive: false
      });

      const result = await passwordService.requestPasswordReset({
        email: 'test@example.com'
      });

      expect(result).toBe('If an account with that email exists, a password reset link has been sent');
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should still return success message if email sending fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      mockPrisma.user.update.mockResolvedValue({});
      mockSendEmail.mockRejectedValue(new Error('Email service down'));

      const result = await passwordService.requestPasswordReset({
        email: 'test@example.com'
      });

      // Should not throw, still return success message
      expect(result).toBe('If an account with that email exists, a password reset link has been sent');
    });

    it('should store reset token in database with expiry', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      mockPrisma.user.update.mockResolvedValue({});

      await passwordService.requestPasswordReset({
        email: 'test@example.com'
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          passwordResetToken: 'mock-token-12345678901234567890123456789012',
          passwordResetExpires: expect.any(Date),
          updatedAt: expect.any(Date)
        }
      });

      // Verify expiry is 1 hour in the future
      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      const expiryTime = updateCall.data.passwordResetExpires.getTime();
      const now = Date.now();
      const oneHourInMs = 60 * 60 * 1000;

      expect(expiryTime).toBeGreaterThan(now);
      expect(expiryTime).toBeLessThan(now + oneHourInMs + 1000); // Allow 1s tolerance
    });

    it('should include reset URL with token in email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      mockPrisma.user.update.mockResolvedValue({});

      await passwordService.requestPasswordReset({
        email: 'test@example.com'
      });

      const emailHtml = mockSendEmail.mock.calls[0][2];
      expect(emailHtml).toContain('/reset-password?token=mock-token-12345678901234567890123456789012');
    });

    it('should handle email address case-insensitively', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(validUser);
      mockPrisma.user.update.mockResolvedValue({});

      await passwordService.requestPasswordReset({
        email: 'TEST@EXAMPLE.COM'
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: expect.any(Object)
      });
    });
  });

  describe('Password Validation', () => {
    it('should reject passwords shorter than 8 characters', () => {
      expect(() => passwordService.validatePassword('Short1!')).toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should reject passwords without uppercase letter', () => {
      expect(() => passwordService.validatePassword('lowercase1!')).toThrow(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    });

    it('should reject passwords without lowercase letter', () => {
      expect(() => passwordService.validatePassword('UPPERCASE1!')).toThrow(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    });

    it('should reject passwords without number', () => {
      expect(() => passwordService.validatePassword('NoNumber!')).toThrow(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    });

    it('should reject passwords without special character', () => {
      expect(() => passwordService.validatePassword('NoSpecial1')).toThrow(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    });

    it('should accept valid strong password', () => {
      expect(() => passwordService.validatePassword('ValidPass123!')).not.toThrow();
    });
  });
});
