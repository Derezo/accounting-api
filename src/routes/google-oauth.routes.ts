/**
 * Google OAuth Routes
 * Authentication and authorization for Google Calendar integration
 */

import { Router } from 'express';
import { googleOAuthController } from '@/controllers/google-oauth.controller';
import { authMiddleware } from '@/middleware/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/auth/google:
 *   get:
 *     summary: Initiate Google OAuth flow
 *     description: Generate Google OAuth authorization URL for calendar access
 *     tags: [Google OAuth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: returnUrl
 *         in: query
 *         description: URL to redirect after OAuth completion
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OAuth URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authUrl:
 *                   type: string
 *                   description: Google OAuth authorization URL
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  authMiddleware,
  googleOAuthController.initiateOAuth.bind(googleOAuthController)
);

/**
 * @swagger
 * /api/v1/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     description: Handle OAuth callback from Google after user authorization
 *     tags: [Google OAuth]
 *     parameters:
 *       - name: code
 *         in: query
 *         required: true
 *         description: Authorization code from Google
 *         schema:
 *           type: string
 *       - name: state
 *         in: query
 *         required: true
 *         description: State parameter for CSRF protection
 *         schema:
 *           type: string
 *       - name: error
 *         in: query
 *         description: Error from Google OAuth
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirects to frontend with success/error status
 *       400:
 *         description: Missing required parameters
 */
router.get(
  '/callback',
  googleOAuthController.handleCallback.bind(googleOAuthController)
);

/**
 * @swagger
 * /api/v1/auth/google/disconnect:
 *   post:
 *     summary: Disconnect Google Calendar
 *     description: Revoke Google Calendar access and delete stored tokens
 *     tags: [Google OAuth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Google Calendar disconnected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/disconnect',
  authMiddleware,
  googleOAuthController.disconnect.bind(googleOAuthController)
);

/**
 * @swagger
 * /api/v1/auth/google/status:
 *   get:
 *     summary: Get Google Calendar connection status
 *     description: Check if user has connected Google Calendar and sync status
 *     tags: [Google OAuth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connected:
 *                   type: boolean
 *                 syncEnabled:
 *                   type: boolean
 *                 lastSyncAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 lastSyncError:
 *                   type: string
 *                   nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/status',
  authMiddleware,
  googleOAuthController.getStatus.bind(googleOAuthController)
);

export default router;
