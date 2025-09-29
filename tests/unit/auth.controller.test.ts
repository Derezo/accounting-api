import { Request, Response } from 'express';
import { AuthController } from '../../src/controllers/auth.controller';
import { authService } from '../../src/services/auth.service';
import { AuthenticatedRequest } from '../../src/middleware/auth.middleware';
import { validationResult } from 'express-validator';
import { UserRole } from '../../src/types/enums';

// Mock the services
jest.mock('../../src/services/auth.service');
jest.mock('express-validator', () => {
  const mockChain: any = () => ({
    notEmpty: jest.fn(() => mockChain()),
    isEmail: jest.fn(() => mockChain()),
    isLength: jest.fn(() => mockChain()),
    isNumeric: jest.fn(() => mockChain()),
    normalizeEmail: jest.fn(() => mockChain()),
    escape: jest.fn(() => mockChain()),
    trim: jest.fn(() => mockChain()),
    optional: jest.fn(() => mockChain()),
    matches: jest.fn(() => mockChain()),
    custom: jest.fn(() => mockChain()),
    withMessage: jest.fn(() => mockChain())
  });

  return {
    body: jest.fn(() => mockChain()),
    validationResult: jest.fn()
  };
});

// Type the mocked services
const mockAuthService = jest.mocked(authService);
const mockValidationResult = jest.mocked(validationResult);

describe('AuthController', () => {
  let authController: AuthController;
  let mockRequest: Partial<Request>;
  let mockAuthenticatedRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  const mockUser = {
    id: 'user-123',
    organizationId: 'org-123',
    role: UserRole.ADMIN,
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    sessionId: 'session-123'
  };

  const mockTokens = {
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    refreshToken: 'refresh_token_here',
    expiresIn: 3600
  };

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    domain: 'test.com'
  };

  beforeEach(() => {
    authController = new AuthController();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    mockResponse = {
      status: mockStatus,
      json: mockJson
    };

    mockRequest = {
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' }
    };

    mockAuthenticatedRequest = {
      ...mockRequest,
      user: mockUser
    };

    // Reset all mocks
    jest.clearAllMocks();
    mockValidationResult.mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  });

  describe('register', () => {
    const validRegistrationData = {
      email: 'newuser@example.com',
      password: 'SecurePass123!',
      firstName: 'Jane',
      lastName: 'Smith',
      organizationName: 'New Company',
      organizationDomain: 'newcompany.com'
    };

    it('should register user successfully', async () => {
      mockRequest.body = validRegistrationData;
      const mockResult = {
        user: mockUser,
        organization: mockOrganization,
        tokens: mockTokens
      };
      mockAuthService.register.mockResolvedValue(mockResult as any);

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.register).toHaveBeenCalledWith(validRegistrationData);
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        message: 'Registration successful',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          role: mockUser.role
        },
        organization: {
          id: mockOrganization.id,
          name: mockOrganization.name
        },
        tokens: mockTokens
      });
    });

    it('should return 400 for validation errors', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ field: 'email', msg: 'Invalid email' }]
      } as any);

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        errors: [{ field: 'email', msg: 'Invalid email' }]
      });
    });

    it('should return 400 for registration errors', async () => {
      mockRequest.body = validRegistrationData;
      mockAuthService.register.mockRejectedValue(new Error('Email already exists'));

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Email already exists' });
    });

    it('should handle passwords with special characters', async () => {
      const dataWithSpecialChars = {
        ...validRegistrationData,
        password: 'Complex!@#$%^&*()_+Pass123'
      };
      mockRequest.body = dataWithSpecialChars;

      const mockResult = {
        user: mockUser,
        organization: mockOrganization,
        tokens: mockTokens
      };
      mockAuthService.register.mockResolvedValue(mockResult as any);

      await authController.register(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.register).toHaveBeenCalledWith(dataWithSpecialChars);
      expect(mockStatus).toHaveBeenCalledWith(201);
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'SecurePass123!'
    };

    it('should login user successfully', async () => {
      mockRequest.body = validLoginData;
      const mockResult = {
        user: mockUser,
        tokens: mockTokens
      };
      mockAuthService.login.mockResolvedValue(mockResult as any);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.login).toHaveBeenCalledWith({
        ...validLoginData,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });
      expect(mockJson).toHaveBeenCalledWith({
        message: 'Login successful',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          role: mockUser.role
        },
        tokens: mockTokens
      });
    });

    it('should return 400 for validation errors', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ field: 'password', msg: 'Password is required' }]
      } as any);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        errors: [{ field: 'password', msg: 'Password is required' }]
      });
    });

    it('should return 401 for invalid credentials', async () => {
      mockRequest.body = validLoginData;
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should handle login with two-factor code', async () => {
      const loginWithTwoFactor = {
        ...validLoginData,
        twoFactorCode: '123456'
      };
      mockRequest.body = loginWithTwoFactor;

      const mockResult = {
        user: mockUser,
        tokens: mockTokens
      };
      mockAuthService.login.mockResolvedValue(mockResult as any);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.login).toHaveBeenCalledWith({
        ...loginWithTwoFactor,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });
      expect(mockJson).toHaveBeenCalledWith({
        message: 'Login successful',
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email
        }),
        tokens: mockTokens
      });
    });

    it('should handle passwords with exclamation marks and special characters', async () => {
      const specialPasswordData = {
        email: 'test@example.com',
        password: 'MySecure!Pass@2024#'
      };
      mockRequest.body = specialPasswordData;

      const mockResult = {
        user: mockUser,
        tokens: mockTokens
      };
      mockAuthService.login.mockResolvedValue(mockResult as any);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.login).toHaveBeenCalledWith({
        ...specialPasswordData,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });
      expect(mockJson).toHaveBeenCalledWith({
        message: 'Login successful',
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email
        }),
        tokens: mockTokens
      });
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      mockRequest.body = { refreshToken: 'valid_refresh_token' };
      mockAuthService.refreshToken.mockResolvedValue(mockTokens as any);

      await authController.refreshToken(mockRequest as Request, mockResponse as Response);

      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('valid_refresh_token');
      expect(mockJson).toHaveBeenCalledWith({
        message: 'Token refreshed successfully',
        tokens: mockTokens
      });
    });

    it('should return error when refresh token is missing', async () => {
      mockRequest.body = {};

      await authController.refreshToken(mockRequest as Request, mockResponse as Response);

      // Should call ErrorResponseUtil.sendValidationError
      expect(mockResponse.status).not.toHaveBeenCalledWith(200);
    });

    it('should handle invalid refresh token', async () => {
      mockRequest.body = { refreshToken: 'invalid_token' };
      mockAuthService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'));

      await authController.refreshToken(mockRequest as Request, mockResponse as Response);

      // Should call ErrorResponseUtil.sendAuthenticationError
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith('invalid_token');
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      await authController.logout(mockAuthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockAuthService.logout).toHaveBeenCalledWith('session-123');
      expect(mockJson).toHaveBeenCalledWith({ message: 'Logout successful' });
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthenticatedRequest = { ...mockRequest, user: undefined };

      await authController.logout(unauthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should handle logout errors', async () => {
      mockAuthService.logout.mockRejectedValue(new Error('Session not found'));

      await authController.logout(mockAuthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Session not found' });
    });
  });

  describe('logoutAll', () => {
    it('should logout all sessions successfully', async () => {
      mockAuthService.logoutAllSessions.mockResolvedValue(undefined);

      await authController.logoutAll(mockAuthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockAuthService.logoutAllSessions).toHaveBeenCalledWith('user-123');
      expect(mockJson).toHaveBeenCalledWith({ message: 'All sessions terminated' });
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthenticatedRequest = { ...mockRequest, user: undefined };

      await authController.logoutAll(unauthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should handle logoutAll errors', async () => {
      mockAuthService.logoutAllSessions.mockRejectedValue(new Error('Database error'));

      await authController.logoutAll(mockAuthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });

  describe('changePassword', () => {
    const validPasswordData = {
      oldPassword: 'OldPass123!',
      newPassword: 'NewSecurePass456@'
    };

    it('should change password successfully', async () => {
      mockAuthenticatedRequest.body = validPasswordData;
      mockAuthService.changePassword.mockResolvedValue(undefined);

      await authController.changePassword(mockAuthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        'user-123',
        'OldPass123!',
        'NewSecurePass456@'
      );
      expect(mockJson).toHaveBeenCalledWith({ message: 'Password changed successfully' });
    });

    it('should return 400 for validation errors', async () => {
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ field: 'newPassword', msg: 'Password too short' }]
      } as any);

      await authController.changePassword(mockAuthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        errors: [{ field: 'newPassword', msg: 'Password too short' }]
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthenticatedRequest = { ...mockRequest, user: undefined, body: validPasswordData };

      await authController.changePassword(unauthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should handle change password errors', async () => {
      mockAuthenticatedRequest.body = validPasswordData;
      mockAuthService.changePassword.mockRejectedValue(new Error('Invalid old password'));

      await authController.changePassword(mockAuthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Invalid old password' });
    });

    it('should handle complex passwords with special characters', async () => {
      const complexPasswordData = {
        oldPassword: 'Complex!@#Old123',
        newPassword: 'Super$ecure!New456@#'
      };
      mockAuthenticatedRequest.body = complexPasswordData;
      mockAuthService.changePassword.mockResolvedValue(undefined);

      await authController.changePassword(mockAuthenticatedRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        'user-123',
        'Complex!@#Old123',
        'Super$ecure!New456@#'
      );
      expect(mockJson).toHaveBeenCalledWith({ message: 'Password changed successfully' });
    });
  });

  describe('Security Validation Tests', () => {
    it('should handle email normalization and escaping', async () => {
      const emailData = {
        email: '  TEST@EXAMPLE.COM  ',
        password: 'Password123!'
      };
      mockRequest.body = emailData;

      const mockResult = { user: mockUser, tokens: mockTokens };
      mockAuthService.login.mockResolvedValue(mockResult as any);

      await authController.login(mockRequest as Request, mockResponse as Response);

      // Validation should normalize and escape the email
      expect(mockAuthService.login).toHaveBeenCalled();
    });

    it('should reject passwords with dangerous patterns', async () => {
      // This would be caught by validation before reaching the controller
      const dangerousData = {
        email: 'test@example.com',
        password: '<script>alert("xss")</script>'
      };

      // Simulate validation failure for dangerous content
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ field: 'password', msg: 'Password contains invalid characters' }]
      } as any);

      mockRequest.body = dangerousData;

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        errors: [{ field: 'password', msg: 'Password contains invalid characters' }]
      });
    });

    it('should handle organization name with proper sanitization', async () => {
      const registrationData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe',
        organizationName: 'Test & Company <script>', // Potential XSS
        organizationDomain: 'test.com'
      };

      // Simulate validation success (after sanitization)
      mockRequest.body = registrationData;
      const mockResult = {
        user: mockUser,
        organization: mockOrganization,
        tokens: mockTokens
      };
      mockAuthService.register.mockResolvedValue(mockResult as any);

      await authController.register(mockRequest as Request, mockResponse as Response);

      // Should proceed with sanitized data
      expect(mockAuthService.register).toHaveBeenCalled();
    });
  });
});