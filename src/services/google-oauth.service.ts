/**
 * Google OAuth 2.0 Service
 * Handles OAuth flow, token management, and refresh logic
 */

import { google } from 'googleapis';
import crypto from 'crypto';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { auditService } from './audit.service';
import { fieldEncryptionService } from './field-encryption.service';
import type { GoogleOAuthTokens, GoogleOAuthState } from '@/types/google-calendar.types';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

class GoogleOAuthService {
  private oauth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  generateAuthUrl(userId: string, organizationId: string, returnUrl?: string): string {
    const state: GoogleOAuthState = {
      userId,
      organizationId,
      returnUrl,
      nonce: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now(),
    };

    const stateString = Buffer.from(JSON.stringify(state)).toString('base64url');

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GOOGLE_SCOPES,
      state: stateString,
      prompt: 'consent', // Force consent screen to get refresh token
    });

    logger.info('Generated Google OAuth URL', { userId, organizationId });
    return authUrl;
  }

  /**
   * Validate and parse OAuth state parameter
   */
  validateState(stateString: string): GoogleOAuthState {
    try {
      const stateJson = Buffer.from(stateString, 'base64url').toString('utf-8');
      const state = JSON.parse(stateJson) as GoogleOAuthState;

      // Validate timestamp (max 10 minutes old)
      const age = Date.now() - state.timestamp;
      if (age > 10 * 60 * 1000) {
        throw new Error('OAuth state expired');
      }

      return state;
    } catch (error) {
      logger.error('Invalid OAuth state', { error, stateString });
      throw new Error('Invalid OAuth state parameter');
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, state: GoogleOAuthState): Promise<GoogleOAuthTokens> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Missing tokens from Google OAuth response');
      }

      const expiresAt = new Date(tokens.expiry_date || Date.now() + 3600 * 1000);

      const oauthTokens: GoogleOAuthTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: tokens.token_type || 'Bearer',
        expiresAt,
        scope: tokens.scope || GOOGLE_SCOPES.join(' '),
      };

      // Store tokens in database (encrypted)
      await this.storeTokens(state.userId, state.organizationId, oauthTokens);

      // Audit log
      await auditService.logAction({
        action: 'GOOGLE_OAUTH_CONNECTED',
        entityType: 'User',
        entityId: state.userId,
        changes: {
          connected: { after: true },
        },
        context: {
          organizationId: state.organizationId,
          userId: state.userId,
          ipAddress: 'oauth-callback',
          userAgent: 'google-oauth',
        },
      });

      logger.info('Google OAuth tokens exchanged successfully', {
        userId: state.userId,
        organizationId: state.organizationId,
      });

      return oauthTokens;
    } catch (error) {
      logger.error('Failed to exchange OAuth code', { error, userId: state.userId });
      throw new Error('Failed to exchange authorization code');
    }
  }

  /**
   * Store OAuth tokens in database (encrypted)
   */
  private async storeTokens(
    userId: string,
    organizationId: string,
    tokens: GoogleOAuthTokens
  ): Promise<void> {
    // Encrypt tokens before storage
    const encryptedAccessToken = await fieldEncryptionService.encryptField(
      tokens.accessToken,
      {
        organizationId,
        fieldName: 'accessToken',
      }
    );
    const encryptedRefreshToken = await fieldEncryptionService.encryptField(
      tokens.refreshToken,
      {
        organizationId,
        fieldName: 'refreshToken',
      }
    );

    await prisma.userGoogleToken.upsert({
      where: { userId },
      create: {
        userId,
        organizationId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenType: tokens.tokenType,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        syncEnabled: true,
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenType: tokens.tokenType,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        lastSyncAt: null,
        lastSyncError: null,
      },
    });

    logger.info('Stored encrypted Google OAuth tokens', { userId, organizationId });
  }

  /**
   * Get valid access token for user (auto-refresh if expired)
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const tokenRecord = await prisma.userGoogleToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord) {
      throw new Error('No Google OAuth tokens found for user');
    }

    // Check if token is expired
    const now = new Date();
    const isExpired = tokenRecord.expiresAt <= now;

    if (!isExpired) {
      // Decrypt and return current access token
      const decryptedToken = await fieldEncryptionService.decryptField(
        tokenRecord.accessToken,
        {
          organizationId: tokenRecord.organizationId,
          fieldName: 'accessToken',
        }
      );
      return decryptedToken;
    }

    // Token expired - refresh it
    logger.info('Access token expired, refreshing', { userId });
    return await this.refreshAccessToken(userId, tokenRecord.organizationId);
  }

  /**
   * Refresh expired access token
   */
  private async refreshAccessToken(userId: string, organizationId: string): Promise<string> {
    try {
      const tokenRecord = await prisma.userGoogleToken.findUnique({
        where: { userId },
      });

      if (!tokenRecord) {
        throw new Error('No tokens found');
      }

      // Decrypt refresh token
      const decryptedRefreshToken = await fieldEncryptionService.decryptField(
        tokenRecord.refreshToken,
        {
          organizationId,
          fieldName: 'refreshToken',
        }
      );

      // Set refresh token and get new access token
      this.oauth2Client.setCredentials({
        refresh_token: decryptedRefreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error('No access token in refresh response');
      }

      const newExpiresAt = new Date(credentials.expiry_date || Date.now() + 3600 * 1000);

      // Encrypt and store new access token
      const encryptedAccessToken = await fieldEncryptionService.encryptField(
        credentials.access_token,
        {
          organizationId,
          fieldName: 'accessToken',
        }
      );

      await prisma.userGoogleToken.update({
        where: { userId },
        data: {
          accessToken: encryptedAccessToken,
          expiresAt: newExpiresAt,
        },
      });

      logger.info('Refreshed Google access token', { userId, organizationId });
      return credentials.access_token;
    } catch (error) {
      logger.error('Failed to refresh access token', { error, userId, organizationId });

      // Mark token as invalid
      await prisma.userGoogleToken.update({
        where: { userId },
        data: {
          lastSyncError: 'Token refresh failed - please reconnect Google Calendar',
        },
      });

      throw new Error('Failed to refresh Google access token - please reconnect');
    }
  }

  /**
   * Disconnect Google Calendar (revoke tokens)
   */
  async disconnect(userId: string, organizationId: string): Promise<void> {
    try {
      const tokenRecord = await prisma.userGoogleToken.findUnique({
        where: { userId },
      });

      if (!tokenRecord) {
        return; // Already disconnected
      }

      // Decrypt access token
      const decryptedAccessToken = await fieldEncryptionService.decryptField(
        tokenRecord.accessToken,
        {
          organizationId,
          fieldName: 'accessToken',
        }
      );

      // Revoke token with Google
      try {
        await this.oauth2Client.revokeToken(decryptedAccessToken);
      } catch (revokeError) {
        logger.warn('Failed to revoke Google token', { revokeError, userId });
        // Continue anyway - delete from our database
      }

      // Delete from database
      await prisma.userGoogleToken.delete({
        where: { userId },
      });

      // Audit log
      await auditService.logAction({
        action: 'GOOGLE_OAUTH_DISCONNECTED',
        entityType: 'User',
        entityId: userId,
        changes: {
          connected: { before: true, after: false },
        },
        context: {
          organizationId,
          userId,
          ipAddress: 'system',
          userAgent: 'google-oauth',
        },
      });

      logger.info('Disconnected Google Calendar', { userId, organizationId });
    } catch (error) {
      logger.error('Failed to disconnect Google Calendar', { error, userId, organizationId });
      throw new Error('Failed to disconnect Google Calendar');
    }
  }

  /**
   * Get OAuth2 client with valid credentials for user
   */
  async getAuthenticatedClient(userId: string): Promise<typeof this.oauth2Client> {
    const accessToken = await this.getValidAccessToken(userId);

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    client.setCredentials({
      access_token: accessToken,
    });

    return client;
  }

  /**
   * Check if user has connected Google Calendar
   */
  async isConnected(userId: string): Promise<boolean> {
    const tokenRecord = await prisma.userGoogleToken.findUnique({
      where: { userId },
    });

    return !!tokenRecord;
  }

  /**
   * Get connection status for user
   */
  async getConnectionStatus(userId: string): Promise<{
    connected: boolean;
    syncEnabled: boolean;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
  }> {
    const tokenRecord = await prisma.userGoogleToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord) {
      return {
        connected: false,
        syncEnabled: false,
        lastSyncAt: null,
        lastSyncError: null,
      };
    }

    return {
      connected: true,
      syncEnabled: tokenRecord.syncEnabled,
      lastSyncAt: tokenRecord.lastSyncAt,
      lastSyncError: tokenRecord.lastSyncError,
    };
  }
}

export const googleOAuthService = new GoogleOAuthService();
