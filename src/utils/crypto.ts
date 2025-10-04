import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config/config';

const SALT_ROUNDS = 12;
const ALGORITHM = 'aes-256-gcm';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Password strength validation function
 * Enforces strict password requirements for security
 *
 * Requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 *
 * @param password - The password to validate
 * @returns Object with validation result and any error messages
 */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)');
  }

  return { valid: errors.length === 0, errors };
}

export function generateRandomToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function generateApiKey(): { key: string; hashedKey: string } {
  const key = `sk_${generateRandomToken(32)}`;
  const hashedKey = crypto
    .createHash('sha256')
    .update(key + config.API_KEY_SALT)
    .digest('hex');

  return { key, hashedKey };
}

export function hashApiKey(key: string): string {
  return crypto
    .createHash('sha256')
    .update(key + config.API_KEY_SALT)
    .digest('hex');
}

export function encrypt(text: string, organizationKey?: string): string {
  const key = Buffer.from(
    organizationKey || config.ENCRYPTION_KEY,
    'utf8'
  ).slice(0, 32);

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string, organizationKey?: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted text components');
  }

  const key = Buffer.from(
    organizationKey || config.ENCRYPTION_KEY,
    'utf8'
  ).slice(0, 32);

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function generateTwoFactorSecret(): string {
  return crypto.randomBytes(20).toString('base64');
}

export function generateOTP(secret: string): string {
  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'));
  const counter = Math.floor(Date.now() / 30000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hash = hmac.update(counterBuffer).digest();
  const offset = hash[hash.length - 1] & 0xf;

  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  ) % 1000000;

  return code.toString().padStart(6, '0');
}

export function verifyOTP(token: string, secret: string): boolean {
  const validTokens = [-1, 0, 1].map(offset => {
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'));
    const counter = Math.floor(Date.now() / 30000) + offset;
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    const hash = hmac.update(counterBuffer).digest();
    const hashOffset = hash[hash.length - 1] & 0xf;

    const code = (
      ((hash[hashOffset] & 0x7f) << 24) |
      ((hash[hashOffset + 1] & 0xff) << 16) |
      ((hash[hashOffset + 2] & 0xff) << 8) |
      (hash[hashOffset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
  });

  return validTokens.includes(token);
}
