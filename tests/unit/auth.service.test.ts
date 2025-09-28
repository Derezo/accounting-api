import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { authService } from '../../src/services/auth.service';
import { verifyPassword } from '../../src/utils/crypto';
import { prisma } from '../testUtils';

describe('AuthService', () => {
  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('register', () => {
    it('should register a new user with organization', async () => {
      const registrationData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        firstName: 'John',
        lastName: 'Doe',
        organizationName: 'Test Company',
        organizationDomain: 'testcompany.com'
      };

      const result = await authService.register(registrationData);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(registrationData.email);
      expect(result.user.firstName).toBe(registrationData.firstName);
      expect(result.user.lastName).toBe(registrationData.lastName);
      expect(result.user.role).toBe('ADMIN');

      expect(result.organization).toBeDefined();
      expect(result.organization.name).toBe(registrationData.organizationName);
      expect(result.organization.domain).toBe(registrationData.organizationDomain);

      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();

      // Verify password was hashed
      const user = await prisma.user.findUnique({
        where: { email: registrationData.email }
      });
      expect(user).toBeDefined();
      expect(user!.passwordHash).not.toBe(registrationData.password);
      const isValidPassword = await verifyPassword(registrationData.password, user!.passwordHash);
      expect(isValidPassword).toBe(true);
    });

    it('should prevent duplicate email registration', async () => {
      const registrationData = {
        email: 'duplicate@example.com',
        password: 'SecurePassword123!',
        firstName: 'John',
        lastName: 'Doe',
        organizationName: 'Test Company',
        organizationDomain: 'testcompany.com'
      };

      await authService.register(registrationData);

      await expect(authService.register(registrationData)).rejects.toThrow(
        'User with this email already exists'
      );
    });
  });

  describe('login', () => {
    let testUser: any;
    const password = 'SecurePassword123!';

    beforeEach(async () => {
      const result = await authService.register({
        email: 'login@example.com',
        password,
        firstName: 'Jane',
        lastName: 'Doe',
        organizationName: 'Login Test Company'
      });
      testUser = result.user;
    });

    it('should login with valid credentials', async () => {
      const result = await authService.login({
        email: testUser.email,
        password,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(testUser.id);
      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should reject invalid password', async () => {
      await expect(
        authService.login({
          email: testUser.email,
          password: 'WrongPassword123!',
          ipAddress: '127.0.0.1'
        })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject non-existent user', async () => {
      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password,
          ipAddress: '127.0.0.1'
        })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should reject inactive user', async () => {
      await prisma.user.update({
        where: { id: testUser.id },
        data: { isActive: false }
      });

      await expect(
        authService.login({
          email: testUser.email,
          password,
          ipAddress: '127.0.0.1'
        })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should lock account after 5 failed attempts', async () => {
      const invalidLoginAttempt = async () => {
        try {
          await authService.login({
            email: testUser.email,
            password: 'WrongPassword',
            ipAddress: '127.0.0.1'
          });
        } catch {
          // Expected to fail
        }
      };

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await invalidLoginAttempt();
      }

      // Check that account is locked
      const user = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(user!.failedAttempts).toBe(5);
      expect(user!.lockedUntil).toBeDefined();
      expect(user!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

      // Attempt to login with correct password should fail
      await expect(
        authService.login({
          email: testUser.email,
          password,
          ipAddress: '127.0.0.1'
        })
      ).rejects.toThrow('Account is locked');
    });
  });

  describe('refreshToken', () => {
    let tokens: any;
    let session: any;

    beforeEach(async () => {
      const result = await authService.register({
        email: 'refresh@example.com',
        password: 'SecurePassword123!',
        firstName: 'Refresh',
        lastName: 'Test',
        organizationName: 'Refresh Test Company'
      });
      tokens = result.tokens;

      session = await prisma.session.findFirst({
        where: { userId: result.user.id }
      });
    });

    it('should refresh valid token', async () => {
      const newTokens = await authService.refreshToken(tokens.refreshToken);

      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(tokens.accessToken);
      expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      await expect(
        authService.refreshToken('invalid-refresh-token')
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should reject expired session', async () => {
      await prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });

      await expect(
        authService.refreshToken(tokens.refreshToken)
      ).rejects.toThrow('Session expired');
    });
  });

  describe('changePassword', () => {
    let user: any;
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword456!';

    beforeEach(async () => {
      const result = await authService.register({
        email: 'changepass@example.com',
        password: oldPassword,
        firstName: 'Change',
        lastName: 'Password',
        organizationName: 'Change Password Company'
      });
      user = result.user;
    });

    it('should change password with valid old password', async () => {
      await authService.changePassword(user.id, oldPassword, newPassword);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      const isNewPasswordValid = await verifyPassword(newPassword, updatedUser!.passwordHash);
      expect(isNewPasswordValid).toBe(true);

      const isOldPasswordValid = await verifyPassword(oldPassword, updatedUser!.passwordHash);
      expect(isOldPasswordValid).toBe(false);

      // Check that all sessions were invalidated
      const sessions = await prisma.session.findMany({
        where: { userId: user.id }
      });
      expect(sessions.length).toBe(0);
    });

    it('should reject invalid old password', async () => {
      await expect(
        authService.changePassword(user.id, 'WrongOldPassword', newPassword)
      ).rejects.toThrow('Invalid current password');
    });
  });

  describe('resetPassword', () => {
    let user: any;
    let resetToken: string;

    beforeEach(async () => {
      const result = await authService.register({
        email: 'reset@example.com',
        password: 'OldPassword123!',
        firstName: 'Reset',
        lastName: 'Password',
        organizationName: 'Reset Password Company'
      });
      user = result.user;

      resetToken = await authService.resetPasswordRequest(user.email);
    });

    it('should reset password with valid token', async () => {
      const newPassword = 'NewResetPassword123!';
      await authService.resetPassword(resetToken, newPassword);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      const isPasswordValid = await verifyPassword(newPassword, updatedUser!.passwordHash);
      expect(isPasswordValid).toBe(true);
      expect(updatedUser!.passwordResetToken).toBeNull();
      expect(updatedUser!.passwordResetExpires).toBeNull();
    });

    it('should reject invalid reset token', async () => {
      await expect(
        authService.resetPassword('invalid-token', 'NewPassword123!')
      ).rejects.toThrow('Invalid or expired reset token');
    });

    it('should reject expired reset token', async () => {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetExpires: new Date(Date.now() - 1000) }
      });

      await expect(
        authService.resetPassword(resetToken, 'NewPassword123!')
      ).rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('verifyToken', () => {
    let tokens: any;
    let session: any;

    beforeEach(async () => {
      const result = await authService.register({
        email: 'verify@example.com',
        password: 'Password123!',
        firstName: 'Verify',
        lastName: 'Token',
        organizationName: 'Verify Token Company'
      });
      tokens = result.tokens;

      session = await prisma.session.findFirst({
        where: { userId: result.user.id }
      });
    });

    it('should verify valid token', async () => {
      const payload = await authService.verifyToken(tokens.accessToken);

      expect(payload.userId).toBeDefined();
      expect(payload.organizationId).toBeDefined();
      expect(payload.role).toBeDefined();
      expect(payload.sessionId).toBe(session.id);
    });

    it('should reject invalid token', async () => {
      await expect(
        authService.verifyToken('invalid-token')
      ).rejects.toThrow('Invalid token');
    });

    it('should reject token for deleted session', async () => {
      await prisma.session.delete({
        where: { id: session.id }
      });

      await expect(
        authService.verifyToken(tokens.accessToken)
      ).rejects.toThrow('Invalid token');
    });

    it('should reject token for expired session', async () => {
      await prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });

      await expect(
        authService.verifyToken(tokens.accessToken)
      ).rejects.toThrow('Session expired');
    });
  });
});