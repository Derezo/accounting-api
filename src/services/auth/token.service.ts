import jwt from 'jsonwebtoken';
import { config } from '../../config/config';
import { generateRandomToken } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { TokenExpiredError, AuthenticationError } from '../../utils/errors';

export interface TokenPayload {
  userId: string;
  organizationId: string;
  role: string;
  sessionId: string;
  jti?: string;
  iat?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  tokenFamily: string;
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Service responsible for JWT token generation, validation, and management
 */
export class TokenService {
  /**
   * Generate a pair of access and refresh tokens
   */
  generateTokens(payload: TokenPayload, sessionId: string): TokenPair {
    // Add unique identifier to ensure tokens are always different
    const tokenPayload = {
      ...payload,
      jti: generateRandomToken(8), // Add unique JWT ID
      iat: Math.floor(Date.now() / 1000) // Explicit issued at time
    };

    const accessToken = jwt.sign(tokenPayload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN
    } as jwt.SignOptions);

    const refreshPayload: RefreshTokenPayload = {
      userId: payload.userId,
      sessionId,
      tokenFamily: generateRandomToken(16),
      jti: generateRandomToken(8) // Add unique JWT ID for refresh token too
    };

    const refreshToken = jwt.sign(refreshPayload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode an access token
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as TokenPayload;
      return decoded;
    } catch (error: any) {
      logger.warn('Access token verification failed', {
        error: error.message,
        tokenPrefix: token.substring(0, 20) + '...'
      });

      if (error.name === 'TokenExpiredError') {
        throw new TokenExpiredError('access token');
      }

      throw new AuthenticationError('Invalid access token', {
        jwtError: error.name
      });
    }
  }

  /**
   * Verify and decode a refresh token
   */
  verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;
      return decoded;
    } catch (error: any) {
      logger.warn('Refresh token verification failed', {
        error: error.message,
        tokenPrefix: refreshToken.substring(0, 20) + '...'
      });

      if (error.name === 'TokenExpiredError') {
        throw new TokenExpiredError('refresh token');
      }

      throw new AuthenticationError('Invalid refresh token', {
        jwtError: error.name
      });
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Create a new token pair with updated expiration
   */
  refreshTokens(payload: TokenPayload, sessionId: string): TokenPair {
    return this.generateTokens(payload, sessionId);
  }

  /**
   * Validate token format without verifying signature (for logging/debugging)
   */
  isValidTokenFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // JWT tokens have 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Check if each part is valid base64url
    try {
      parts.forEach(part => {
        if (!part) throw new Error('Empty part');
        // Base64url decode test
        Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Decode token payload without verification (for debugging)
   * WARNING: Only use for logging/debugging, not for authentication
   */
  decodeTokenUnsafe(token: string): any {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.warn('Token decode failed', { error });
      return null;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired (without verification)
   */
  isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) {
      return true; // Consider invalid tokens as expired
    }
    return expiration < new Date();
  }

  /**
   * Get time until token expires
   */
  getTimeUntilExpiration(token: string): number {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) {
      return 0;
    }
    return Math.max(0, expiration.getTime() - Date.now());
  }
}

export const tokenService = new TokenService();