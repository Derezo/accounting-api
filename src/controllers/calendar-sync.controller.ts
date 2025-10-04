/**
 * Calendar Sync Controller
 * Handles calendar synchronization endpoints
 */

import { Request, Response } from 'express';
import { googleCalendarSyncService } from '@/services/google-calendar-sync.service';
import { googleOAuthService } from '@/services/google-oauth.service';
import { logger } from '@/utils/logger';

class CalendarSyncController {
  /**
   * Trigger manual calendar sync
   * POST /api/v1/organizations/:orgId/sync/calendar/manual
   */
  async manualSync(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const organizationId = req.params.orgId;

      if (!userId || !organizationId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check if user has Google Calendar connected
      const isConnected = await googleOAuthService.isConnected(userId);
      if (!isConnected) {
        res.status(400).json({
          error: 'Google Calendar not connected',
          message: 'Please connect your Google Calendar first',
        });
        return;
      }

      const result = await googleCalendarSyncService.syncCalendar(userId, organizationId);

      res.json({
        message: 'Calendar sync completed',
        ...result,
      });
    } catch (error) {
      logger.error('Manual calendar sync failed', { error });
      res.status(500).json({
        error: 'Calendar sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get calendar sync status
   * GET /api/v1/organizations/:orgId/sync/calendar/status
   */
  async getSyncStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const status = await googleOAuthService.getConnectionStatus(userId);

      res.json({
        connected: status.connected,
        syncEnabled: status.syncEnabled,
        lastSyncAt: status.lastSyncAt,
        lastSyncError: status.lastSyncError,
      });
    } catch (error) {
      logger.error('Failed to get sync status', { error });
      res.status(500).json({
        error: 'Failed to get sync status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle Google Calendar webhook
   * POST /api/v1/organizations/:orgId/sync/calendar/webhook
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Implement Google Calendar push notification handling
      // This requires setting up a Google Cloud Pub/Sub topic and watch channel

      logger.info('Received Google Calendar webhook', {
        headers: req.headers,
        body: req.body,
      });

      res.status(200).send('OK');
    } catch (error) {
      logger.error('Failed to handle calendar webhook', { error });
      res.status(500).json({
        error: 'Webhook processing failed',
      });
    }
  }
}

export const calendarSyncController = new CalendarSyncController();
