/**
 * Calendar Sync Routes
 * Endpoints for managing Google Calendar synchronization
 */

import { Router } from 'express';
import { calendarSyncController } from '@/controllers/calendar-sync.controller';
import { authMiddleware } from '@/middleware/auth.middleware';

const router = Router({ mergeParams: true }); // Allows access to :orgId from parent router

/**
 * @swagger
 * /api/v1/organizations/{orgId}/sync/calendar/manual:
 *   post:
 *     summary: Trigger manual calendar sync
 *     description: Manually sync appointments with Google Calendar
 *     tags: [Calendar Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orgId
 *         in: path
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Calendar sync completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 eventsCreated:
 *                   type: number
 *                 eventsUpdated:
 *                   type: number
 *                 eventsDeleted:
 *                   type: number
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Google Calendar not connected
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/manual',
  authMiddleware,
  calendarSyncController.manualSync.bind(calendarSyncController)
);

/**
 * @swagger
 * /api/v1/organizations/{orgId}/sync/calendar/status:
 *   get:
 *     summary: Get calendar sync status
 *     description: Get current sync status and last sync information
 *     tags: [Calendar Sync]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orgId
 *         in: path
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
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
  calendarSyncController.getSyncStatus.bind(calendarSyncController)
);

/**
 * @swagger
 * /api/v1/organizations/{orgId}/sync/calendar/webhook:
 *   post:
 *     summary: Google Calendar webhook
 *     description: Receive push notifications from Google Calendar
 *     tags: [Calendar Sync]
 *     parameters:
 *       - name: orgId
 *         in: path
 *         required: true
 *         description: Organization ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post(
  '/webhook',
  calendarSyncController.handleWebhook.bind(calendarSyncController)
);

export default router;
