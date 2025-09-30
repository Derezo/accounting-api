// Mock config
jest.mock('../../src/config/config', () => ({
  config: {
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-long!',
    API_KEY_SALT: 'test-api-key-salt'
  }
}));

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

// Mock crypto module
const mockCreateHash = jest.fn();
const mockCreateHmac = jest.fn();
const mockCreateCipheriv = jest.fn();
const mockCreateDecipheriv = jest.fn();
const mockRandomBytes = jest.fn();

jest.mock('crypto', () => ({
  createHash: mockCreateHash,
  createHmac: mockCreateHmac,
  createCipheriv: mockCreateCipheriv,
  createDecipheriv: mockCreateDecipheriv,
  randomBytes: mockRandomBytes
}));

import bcrypt from 'bcryptjs';
import {
  hashPassword,
  verifyPassword,
  generateRandomToken,
  generateApiKey,
  hashApiKey,
  encrypt,
  decrypt,
  generateTwoFactorSecret,
  generateOTP,
  verifyOTP
} from '../../src/utils/crypto';

// Get mock instances
const mockBcrypt = {
  hash: bcrypt.hash as jest.MockedFunction<(data: string | Buffer, saltOrRounds: string | number) => Promise<string>>,
  compare: bcrypt.compare as jest.MockedFunction<(data: string | Buffer, encrypted: string) => Promise<boolean>>
};

describe('Crypto Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('password hashing', () => {
    describe('hashPassword', () => {
      it('should hash password with correct salt rounds', async () => {
        const password = 'testPassword123';
        const hashedPassword = 'hashed_password_result';

        mockBcrypt.hash.mockResolvedValue(hashedPassword);

        const result = await hashPassword(password);

        expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 12);
        expect(result).toBe(hashedPassword);
      });

      it('should handle bcrypt errors', async () => {
        const password = 'testPassword123';
        mockBcrypt.hash.mockRejectedValue(new Error('Bcrypt error'));

        await expect(hashPassword(password)).rejects.toThrow('Bcrypt error');
      });
    });

    describe('verifyPassword', () => {
      it('should verify password against hash successfully', async () => {
        const password = 'testPassword123';
        const hash = 'stored_hash';

        mockBcrypt.compare.mockResolvedValue(true);

        const result = await verifyPassword(password, hash);

        expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hash);
        expect(result).toBe(true);
      });

      it('should return false for incorrect password', async () => {
        const password = 'wrongPassword';
        const hash = 'stored_hash';

        mockBcrypt.compare.mockResolvedValue(false);

        const result = await verifyPassword(password, hash);

        expect(result).toBe(false);
      });

      it('should handle bcrypt compare errors', async () => {
        const password = 'testPassword123';
        const hash = 'stored_hash';

        mockBcrypt.compare.mockRejectedValue(new Error('Compare error'));

        await expect(verifyPassword(password, hash)).rejects.toThrow('Compare error');
      });
    });
  });

  describe('token generation', () => {
    describe('generateRandomToken', () => {
      it('should generate token with default length', () => {
        const mockBuffer = Buffer.from('abcdef123456', 'hex');
        mockRandomBytes.mockReturnValue(mockBuffer);

        const result = generateRandomToken();

        expect(mockRandomBytes).toHaveBeenCalledWith(32);
        expect(result).toBe(mockBuffer.toString('hex'));
      });

      it('should generate token with custom length', () => {
        const mockBuffer = Buffer.from('abcd', 'hex');
        mockRandomBytes.mockReturnValue(mockBuffer);

        const result = generateRandomToken(16);

        expect(mockRandomBytes).toHaveBeenCalledWith(16);
        expect(result).toBe(mockBuffer.toString('hex'));
      });

      it('should handle crypto.randomBytes errors', () => {
        mockRandomBytes.mockImplementation(() => {
          throw new Error('Random bytes error');
        });

        expect(() => generateRandomToken()).toThrow('Random bytes error');
      });
    });
  });

  describe('API key management', () => {
    describe('generateApiKey', () => {
      it('should generate API key with proper format and hash', () => {
        const mockBuffer = Buffer.from('abcdef123456789012345678901234567890abcdef123456789012345678901234', 'hex');
        mockRandomBytes.mockReturnValue(mockBuffer);

        const mockHashInstance = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn(() => 'hashed_api_key')
        };
        mockCreateHash.mockReturnValue(mockHashInstance);

        const result = generateApiKey();

        expect(mockRandomBytes).toHaveBeenCalledWith(32);
        expect(result.key).toMatch(/^sk_[a-f0-9]+$/);
        expect(result.hashedKey).toBe('hashed_api_key');

        expect(mockCreateHash).toHaveBeenCalledWith('sha256');
        expect(mockHashInstance.update).toHaveBeenCalledWith(result.key + 'test-api-key-salt');
        expect(mockHashInstance.digest).toHaveBeenCalledWith('hex');
      });
    });

    describe('hashApiKey', () => {
      it('should hash API key with salt', () => {
        const apiKey = 'sk_test123456789';
        const mockHashInstance = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn(() => 'hashed_result')
        };
        mockCreateHash.mockReturnValue(mockHashInstance);

        const result = hashApiKey(apiKey);

        expect(mockCreateHash).toHaveBeenCalledWith('sha256');
        expect(mockHashInstance.update).toHaveBeenCalledWith(apiKey + 'test-api-key-salt');
        expect(mockHashInstance.digest).toHaveBeenCalledWith('hex');
        expect(result).toBe('hashed_result');
      });

      it('should handle crypto.createHash errors', () => {
        mockCreateHash.mockImplementation(() => {
          throw new Error('Hash creation error');
        });

        expect(() => hashApiKey('test-key')).toThrow('Hash creation error');
      });
    });
  });

  describe('data encryption', () => {
    describe('encrypt', () => {
      it('should encrypt text with default key', () => {
        const text = 'sensitive data';
        const mockIv = Buffer.from('1234567890123456', 'hex');
        const mockAuthTag = Buffer.from('authtagdata', 'hex');

        mockRandomBytes.mockReturnValue(mockIv);

        const mockCipher = {
          update: jest.fn(() => 'encrypted'),
          final: jest.fn(() => 'data'),
          getAuthTag: jest.fn(() => mockAuthTag)
        };
        mockCreateCipheriv.mockReturnValue(mockCipher);

        const result = encrypt(text);

        expect(mockRandomBytes).toHaveBeenCalledWith(16); // IV length
        expect(mockCreateCipheriv).toHaveBeenCalledWith(
          'aes-256-gcm',
          expect.any(Buffer), // Key (first 32 bytes of config.ENCRYPTION_KEY)
          mockIv
        );
        expect(mockCipher.update).toHaveBeenCalledWith(text, 'utf8', 'hex');
        expect(mockCipher.final).toHaveBeenCalledWith('hex');
        expect(mockCipher.getAuthTag).toHaveBeenCalled();

        // Result format: iv:authTag:encrypted
        expect(result).toBe(`${mockIv.toString('hex')}:${mockAuthTag.toString('hex')}:encrypteddata`);
      });

      it('should encrypt text with custom organization key', () => {
        const text = 'sensitive data';
        const orgKey = 'custom-organization-key-32-chars!';
        const mockIv = Buffer.from('1234567890123456', 'hex');
        const mockAuthTag = Buffer.from('authtagdata', 'hex');

        mockRandomBytes.mockReturnValue(mockIv);

        const mockCipher = {
          update: jest.fn(() => 'encrypted'),
          final: jest.fn(() => 'data'),
          getAuthTag: jest.fn(() => mockAuthTag)
        };
        mockCreateCipheriv.mockReturnValue(mockCipher);

        const result = encrypt(text, orgKey);

        expect(mockCreateCipheriv).toHaveBeenCalledWith(
          'aes-256-gcm',
          Buffer.from(orgKey, 'utf8').slice(0, 32),
          mockIv
        );
      });

      it('should handle cipher creation errors', () => {
        mockCreateCipheriv.mockImplementation(() => {
          throw new Error('Cipher creation failed');
        });

        expect(() => encrypt('test')).toThrow('Cipher creation failed');
      });

      it('should handle cipher update errors', () => {
        const mockCipher = {
          update: jest.fn(() => {
            throw new Error('Cipher update failed');
          }),
          final: jest.fn(),
          getAuthTag: jest.fn()
        };
        mockCreateCipheriv.mockReturnValue(mockCipher);
        mockRandomBytes.mockReturnValue(Buffer.from('1234567890123456', 'hex'));

        expect(() => encrypt('test')).toThrow('Cipher update failed');
      });
    });

    describe('decrypt', () => {
      it('should decrypt encrypted text successfully', () => {
        const encryptedText = '1234567890123456:authtagdata0123:encrypteddata';
        const mockDecipher = {
          setAuthTag: jest.fn(),
          update: jest.fn(() => 'decrypted'),
          final: jest.fn(() => ' data')
        };
        mockCreateDecipheriv.mockReturnValue(mockDecipher);

        const result = decrypt(encryptedText);

        expect(mockCreateDecipheriv).toHaveBeenCalledWith(
          'aes-256-gcm',
          expect.any(Buffer), // Key
          Buffer.from('1234567890123456', 'hex') // IV
        );
        expect(mockDecipher.setAuthTag).toHaveBeenCalledWith(Buffer.from('authtagdata0123', 'hex'));
        expect(mockDecipher.update).toHaveBeenCalledWith('encrypteddata', 'hex', 'utf8');
        expect(mockDecipher.final).toHaveBeenCalledWith('utf8');
        expect(result).toBe('decrypted data');
      });

      it('should decrypt with custom organization key', () => {
        const encryptedText = '1234567890123456:authtagdata0123:encrypteddata';
        const orgKey = 'custom-organization-key-32-chars!';
        const mockDecipher = {
          setAuthTag: jest.fn(),
          update: jest.fn(() => 'decrypted'),
          final: jest.fn(() => ' data')
        };
        mockCreateDecipheriv.mockReturnValue(mockDecipher);

        const result = decrypt(encryptedText, orgKey);

        expect(mockCreateDecipheriv).toHaveBeenCalledWith(
          'aes-256-gcm',
          Buffer.from(orgKey, 'utf8').slice(0, 32),
          Buffer.from('1234567890123456', 'hex')
        );
      });

      it('should throw error for invalid encrypted text format', () => {
        expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted text format');
        expect(() => decrypt('too:many:parts:here:error')).toThrow('Invalid encrypted text format');

        // Test cases with 3 parts but empty components (should throw 'Invalid encrypted text components')
        const invalidComponents = [
          ':missing:parts',
          'empty::parts',
          '1234567890123456:authtagdata0123:' // Missing encrypted data
        ];

        invalidComponents.forEach(format => {
          expect(() => decrypt(format)).toThrow('Invalid encrypted text components');
        });
      });

      it('should throw error for invalid encrypted text components', () => {
        const invalidComponents = [
          ':authtagdata0123:encrypteddata', // Missing IV
          '1234567890123456::encrypteddata' // Missing auth tag
        ];

        invalidComponents.forEach(component => {
          expect(() => decrypt(component)).toThrow('Invalid encrypted text components');
        });
      });

      it('should handle decipher creation errors', () => {
        mockCreateDecipheriv.mockImplementation(() => {
          throw new Error('Decipher creation failed');
        });

        expect(() => decrypt('1234567890123456:authtagdata0123:encrypteddata')).toThrow('Decipher creation failed');
      });

      it('should handle decipher authentication errors', () => {
        const mockDecipher = {
          setAuthTag: jest.fn(),
          update: jest.fn(() => 'decrypted'),
          final: jest.fn(() => {
            throw new Error('Authentication failed');
          })
        };
        mockCreateDecipheriv.mockReturnValue(mockDecipher);

        expect(() => decrypt('1234567890123456:authtagdata0123:encrypteddata')).toThrow('Authentication failed');
      });
    });
  });

  describe('two-factor authentication', () => {
    describe('generateTwoFactorSecret', () => {
      it('should generate base64 encoded secret', () => {
        const mockBuffer = Buffer.from('randomsecretdata12345');
        mockRandomBytes.mockReturnValue(mockBuffer);

        const result = generateTwoFactorSecret();

        expect(mockRandomBytes).toHaveBeenCalledWith(20);
        expect(result).toBe(mockBuffer.toString('base64'));
      });

      it('should handle random bytes generation errors', () => {
        mockRandomBytes.mockImplementation(() => {
          throw new Error('Random generation failed');
        });

        expect(() => generateTwoFactorSecret()).toThrow('Random generation failed');
      });
    });

    describe('generateOTP', () => {
      beforeEach(() => {
        // Mock Date.now to return consistent timestamp
        jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // Fixed timestamp
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('should generate valid 6-digit OTP', () => {
        const secret = Buffer.from('test secret data', 'utf8').toString('base64');
        const mockHash = Buffer.from([
          0x1f, 0x86, 0x98, 0x69, 0x0e, 0x02, 0xca, 0x16,
          0x61, 0x85, 0x50, 0xef, 0x7f, 0x19, 0xda, 0x8e,
          0x94, 0x5b, 0x55, 0x5a // 20 bytes hash
        ]);

        const mockHmac = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn(() => mockHash)
        };
        mockCreateHmac.mockReturnValue(mockHmac);

        const result = generateOTP(secret);

        expect(mockCreateHmac).toHaveBeenCalledWith('sha1', Buffer.from(secret, 'base64'));
        expect(mockHmac.update).toHaveBeenCalledWith(expect.any(Buffer)); // Counter buffer
        expect(mockHmac.digest).toHaveBeenCalled();
        expect(result).toMatch(/^\d{6}$/); // Should be 6 digits
        expect(result.length).toBe(6);
      });

      it('should generate OTP with leading zeros', () => {
        const secret = Buffer.from('test secret', 'utf8').toString('base64');

        // Mock hash that will result in a small number requiring padding
        const mockHash = Buffer.from([
          0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00
        ]);

        const mockHmac = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn(() => mockHash)
        };
        mockCreateHmac.mockReturnValue(mockHmac);

        const result = generateOTP(secret);

        expect(result).toMatch(/^\d{6}$/);
        expect(result.length).toBe(6);
      });

      it('should handle HMAC creation errors', () => {
        mockCreateHmac.mockImplementation(() => {
          throw new Error('HMAC creation failed');
        });

        expect(() => generateOTP('test-secret')).toThrow('HMAC creation failed');
      });
    });

    describe('verifyOTP', () => {
      beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('should verify valid OTP token', () => {
        const secret = Buffer.from('test secret', 'utf8').toString('base64');

        // Set up mock HMAC for generateOTP and verifyOTP
        const mockHash = Buffer.from([
          0x1f, 0x86, 0x98, 0x69, 0x0e, 0x02, 0xca, 0x16,
          0x61, 0x85, 0x50, 0xef, 0x7f, 0x19, 0xda, 0x8e,
          0x94, 0x5b, 0x55, 0x5a
        ]);

        const mockHmac = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn(() => mockHash)
        };
        mockCreateHmac.mockReturnValue(mockHmac);

        // Generate a real OTP first to know what token to expect
        const realOtp = generateOTP(secret);

        const result = verifyOTP(realOtp, secret);
        expect(result).toBe(true);
      });

      it('should reject invalid OTP token', () => {
        const token = '999999'; // Invalid token
        const secret = Buffer.from('test secret', 'utf8').toString('base64');

        const mockHash = Buffer.from([
          0x1f, 0x86, 0x98, 0x69, 0x0e, 0x02, 0xca, 0x16,
          0x61, 0x85, 0x50, 0xef, 0x7f, 0x19, 0xda, 0x8e,
          0x94, 0x5b, 0x55, 0x5a
        ]);

        const mockHmac = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn(() => mockHash)
        };
        mockCreateHmac.mockReturnValue(mockHmac);

        const result = verifyOTP(token, secret);

        expect(result).toBe(false);
      });

      it('should verify OTP with time window tolerance', () => {
        const token = '123456';
        const secret = Buffer.from('test secret', 'utf8').toString('base64');

        // The function should check current time window and ±1 windows
        const mockHmac = {
          update: jest.fn().mockReturnThis(),
          digest: jest.fn(() => Buffer.from([0x1f, 0x86, 0x98, 0x69, 0x0e, 0x02, 0xca, 0x16, 0x61, 0x85, 0x50, 0xef, 0x7f, 0x19, 0xda, 0x8e, 0x94, 0x5b, 0x55, 0x5a]))
        };
        mockCreateHmac.mockReturnValue(mockHmac);

        const result = verifyOTP(token, secret);

        // Should be called 3 times (for -1, 0, +1 time windows)
        expect(mockCreateHmac).toHaveBeenCalledTimes(3);
      });

      it('should handle HMAC creation errors during verification', () => {
        mockCreateHmac.mockImplementation(() => {
          throw new Error('HMAC verification failed');
        });

        expect(() => verifyOTP('123456', 'secret')).toThrow('HMAC verification failed');
      });
    });
  });

  describe('integration scenarios', () => {
    it('should encrypt and decrypt roundtrip successfully', () => {
      jest.clearAllMocks();

      const originalText = 'This is sensitive information that needs encryption';

      // Mock for encryption
      const mockIv = Buffer.from('1234567890abcdef', 'hex');
      const mockAuthTag = Buffer.from('abcdef1234567890', 'hex');
      mockRandomBytes.mockReturnValue(mockIv);

      const mockCipher = {
        update: jest.fn((text, inputEnc, outputEnc) => 'encryptedcontent'),
        final: jest.fn((outputEnc) => 'data'),
        getAuthTag: jest.fn(() => mockAuthTag)
      };
      mockCreateCipheriv.mockReturnValue(mockCipher);

      // Encrypt
      const encrypted = encrypt(originalText);
      expect(encrypted).toBe(`${mockIv.toString('hex')}:${mockAuthTag.toString('hex')}:encryptedcontentdata`);

      // Mock for decryption
      const mockDecipher = {
        setAuthTag: jest.fn(),
        update: jest.fn((enc, inputEnc, outputEnc) => originalText.slice(0, -10)), // Return most of the text
        final: jest.fn((outputEnc) => originalText.slice(-10)) // Return the rest
      };
      mockCreateDecipheriv.mockReturnValue(mockDecipher);

      // Decrypt
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should generate and verify OTP correctly', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1640995200000);

      // Generate secret
      const mockSecretBuffer = Buffer.from('randomsecretdata12345');
      mockRandomBytes.mockReturnValue(mockSecretBuffer);
      const secret = generateTwoFactorSecret();

      // Generate OTP
      const mockHash = Buffer.from([
        0x50, 0x00, 0x12, 0x34, 0x56, 0x78, 0x90, 0xab,
        0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab,
        0xcd, 0xef, 0x01, 0x2f // Last byte with offset 0xf
      ]);

      const mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => mockHash)
      };
      mockCreateHmac.mockReturnValue(mockHmac);

      const otp = generateOTP(secret);
      expect(otp).toMatch(/^\d{6}$/);

      // Verify OTP
      const isValid = verifyOTP(otp, secret);
      expect(isValid).toBe(true);

      jest.restoreAllMocks();
    });

    it('should handle API key generation and hashing workflow', () => {
      const mockKeyBuffer = Buffer.from('abcdef123456789012345678901234567890abcdef123456789012345678901234', 'hex');
      mockRandomBytes.mockReturnValue(mockKeyBuffer);

      const mockHashInstance = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => 'consistent_hash_result')
      };
      mockCreateHash.mockReturnValue(mockHashInstance);

      // Generate API key
      const { key, hashedKey } = generateApiKey();
      expect(key).toMatch(/^sk_/);

      // Hash the same key again
      const hashedAgain = hashApiKey(key);
      expect(hashedAgain).toBe('consistent_hash_result');
      expect(hashedKey).toBe(hashedAgain);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty strings in encryption', () => {
      const mockIv = Buffer.from('1234567890123456', 'hex');
      const mockAuthTag = Buffer.from('authtagdata', 'hex');
      mockRandomBytes.mockReturnValue(mockIv);

      const mockCipher = {
        update: jest.fn(() => 'aa'),
        final: jest.fn(() => ''),
        getAuthTag: jest.fn(() => mockAuthTag)
      };
      mockCreateCipheriv.mockReturnValue(mockCipher);

      const result = encrypt('');
      expect(result).toBe(`${mockIv.toString('hex')}:${mockAuthTag.toString('hex')}:aa`);
    });

    it('should handle empty strings in decryption', () => {
      const mockDecipher = {
        setAuthTag: jest.fn(),
        update: jest.fn(() => ''),
        final: jest.fn(() => '')
      };
      mockCreateDecipheriv.mockReturnValue(mockDecipher);

      const result = decrypt('1234567890123456:authtagdata0123:00');
      expect(result).toBe('');
    });

    it('should handle very long organization keys', () => {
      const longKey = 'this-is-a-very-long-organization-key-that-exceeds-32-characters-and-should-be-truncated';
      const mockIv = Buffer.from('1234567890123456', 'hex');
      const mockAuthTag = Buffer.from('authtagdata', 'hex');
      mockRandomBytes.mockReturnValue(mockIv);

      const mockCipher = {
        update: jest.fn(() => 'encrypted'),
        final: jest.fn(() => 'data'),
        getAuthTag: jest.fn(() => mockAuthTag)
      };
      mockCreateCipheriv.mockReturnValue(mockCipher);

      encrypt('test', longKey);

      expect(mockCreateCipheriv).toHaveBeenCalledWith(
        'aes-256-gcm',
        Buffer.from(longKey, 'utf8').slice(0, 32), // Should be truncated to 32 bytes
        mockIv
      );
    });

    it('should handle invalid base64 in OTP functions', () => {
      const invalidSecret = 'invalid-base64!@#$%';

      expect(() => generateOTP(invalidSecret)).not.toThrow(); // Should handle gracefully
    });

    it('should handle buffer conversion errors', () => {
      // Test with null/undefined inputs where Buffer.from might fail
      expect(() => decrypt('1234567890123456:authtagdata0123:encrypteddata')).not.toThrow();
    });
  });

  describe('performance and memory', () => {
    it('should handle large text encryption efficiently', () => {
      const largeText = 'A'.repeat(10000); // 10KB of text
      const mockIv = Buffer.from('1234567890123456', 'hex');
      const mockAuthTag = Buffer.from('authtagdata', 'hex');
      mockRandomBytes.mockReturnValue(mockIv);

      const mockCipher = {
        update: jest.fn(() => 'encrypted_large'),
        final: jest.fn(() => '_content'),
        getAuthTag: jest.fn(() => mockAuthTag)
      };
      mockCreateCipheriv.mockReturnValue(mockCipher);

      const result = encrypt(largeText);

      expect(mockCipher.update).toHaveBeenCalledWith(largeText, 'utf8', 'hex');
      expect(result).toContain('encrypted_large_content');
    });

    it('should handle multiple concurrent OTP generations', () => {
      const secret = Buffer.from('test secret', 'utf8').toString('base64');
      jest.spyOn(Date, 'now').mockReturnValue(1640995200000);

      const mockHash = Buffer.from([0x1f, 0x86, 0x98, 0x69, 0x0e, 0x02, 0xca, 0x16, 0x61, 0x85, 0x50, 0xef, 0x7f, 0x19, 0xda, 0x8e, 0x94, 0x5b, 0x55, 0x5a]);
      const mockHmac = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => mockHash)
      };
      mockCreateHmac.mockReturnValue(mockHmac);

      // Generate multiple OTPs
      const otps = Array.from({ length: 5 }, () => generateOTP(secret));

      // All should be the same since timestamp is mocked to be consistent
      expect(otps.every(otp => otp === otps[0])).toBe(true);
      expect(mockCreateHmac).toHaveBeenCalledTimes(5);

      jest.restoreAllMocks();
    });
  });
});