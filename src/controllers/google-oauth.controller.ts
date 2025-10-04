/**
 * Google OAuth Controller
 * Handles OAuth authentication flow endpoints
 */

import { Request, Response } from 'express';
import { googleOAuthService } from '@/services/google-oauth.service';
import { logger } from '@/utils/logger';

class GoogleOAuthController {
  /**
   * Initiate Google OAuth flow
   * GET /api/v1/auth/google
   */
  async initiateOAuth(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const organizationId = req.user?.organizationId;

      if (!userId || !organizationId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const returnUrl = req.query.returnUrl as string | undefined;

      const authUrl = googleOAuthService.generateAuthUrl(userId, organizationId, returnUrl);

      res.json({
        authUrl,
        message: 'Redirect user to authUrl to complete OAuth flow',
      });
    } catch (error) {
      logger.error('Failed to initiate Google OAuth', { error });
      res.status(500).json({
        error: 'Failed to initiate Google OAuth',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle OAuth callback from Google
   * GET /api/v1/auth/google/callback
   */
  async handleCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.error('OAuth error from Google', { oauthError });
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/calendar?error=oauth_failed`);
        return;
      }

      if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state parameter' });
        return;
      }

      // Validate state
      const stateData = googleOAuthService.validateState(state as string);

      // Exchange code for tokens
      await googleOAuthService.exchangeCodeForTokens(code as string, stateData);

      // Redirect to return URL or default
      const returnUrl = stateData.returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/calendar?success=true`;
      res.redirect(returnUrl);
    } catch (error) {
      logger.error('Failed to handle OAuth callback', { error });
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/calendar?error=callback_failed`);
    }
  }

  /**
   * Disconnect Google Calendar
   * POST /api/v1/auth/google/disconnect
   */
  async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const organizationId = req.user?.organizationId;

      if (!userId || !organizationId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await googleOAuthService.disconnect(userId, organizationId);

      res.json({
        success: true,
        message: 'Google Calendar disconnected successfully',
      });
    } catch (error) {
      logger.error('Failed to disconnect Google Calendar', { error });
      res.status(500).json({
        error: 'Failed to disconnect Google Calendar',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get Google Calendar connection status
   * GET /api/v1/auth/google/status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const status = await googleOAuthService.getConnectionStatus(userId);

      res.json(status);
    } catch (error) {
      logger.error('Failed to get Google Calendar status', { error });
      res.status(500).json({
        error: 'Failed to get connection status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const googleOAuthController = new GoogleOAuthController();
