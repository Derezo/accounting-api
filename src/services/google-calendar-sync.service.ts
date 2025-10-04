/**
 * Google Calendar Sync Service
 * Handles bidirectional synchronization between appointments and Google Calendar
 */

import { google, calendar_v3 } from 'googleapis';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { googleOAuthService } from './google-oauth.service';
import type {
  GoogleCalendarEvent,
  CalendarSyncResult,
  SyncOptions,
} from '@/types/google-calendar.types';

class GoogleCalendarSyncService {
  /**
   * Create Google Calendar event from appointment
   */
  async createCalendarEvent(
    appointmentId: string,
    userId: string
  ): Promise<string | null> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          customer: {
            include: {
              person: true,
              business: true,
            },
          },
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Check if user has Google Calendar connected
      const isConnected = await googleOAuthService.isConnected(userId);
      if (!isConnected) {
        logger.warn('User does not have Google Calendar connected', { userId, appointmentId });
        return null;
      }

      // Get authenticated Google client
      const auth = await googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      // Build calendar event
      const customerEmail = appointment.customer.person?.email || appointment.customer.business?.email;
      const customerName = appointment.customer.person
        ? `${appointment.customer.person.firstName} ${appointment.customer.person.lastName}`
        : appointment.customer.business?.legalName || 'Customer';

      const event: calendar_v3.Schema$Event = {
        summary: `${appointment.title} - ${customerName}`,
        description: appointment.description || `Appointment with ${customerName}`,
        location: undefined, // Appointment model doesn't have location field
        start: {
          dateTime: appointment.startTime.toISOString(),
          timeZone: 'America/Toronto', // TODO: Make timezone configurable
        },
        end: {
          dateTime: appointment.endTime
            ? appointment.endTime.toISOString()
            : new Date(appointment.startTime.getTime() + 60 * 60 * 1000).toISOString(), // Default 1 hour
          timeZone: 'America/Toronto',
        },
        attendees: customerEmail
          ? [
              {
                email: customerEmail,
                displayName: customerName,
                responseStatus: 'needsAction',
              },
            ]
          : undefined,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 60 },
          ],
        },
      };

      // Create event in Google Calendar
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
        sendUpdates: 'all', // Send email notifications
      });

      const eventId = response.data.id;
      if (!eventId) {
        throw new Error('No event ID returned from Google Calendar');
      }

      // Store event ID in appointment
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          googleCalendarEventId: eventId,
          googleCalendarSyncedAt: new Date(),
        },
      });

      logger.info('Created Google Calendar event', {
        appointmentId,
        eventId,
        userId,
      });

      return eventId;
    } catch (error) {
      logger.error('Failed to create Google Calendar event', {
        error,
        appointmentId,
        userId,
      });

      // Store error in appointment
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          lastSyncError: `Failed to create calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      });

      return null;
    }
  }

  /**
   * Update Google Calendar event when appointment changes
   */
  async updateCalendarEvent(
    appointmentId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          customer: {
            include: {
              person: true,
              business: true,
            },
          },
        },
      });

      if (!appointment || !appointment.googleCalendarEventId) {
        logger.warn('Cannot update calendar event - no event ID', { appointmentId });
        return false;
      }

      const auth = await googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const customerEmail = appointment.customer.person?.email || appointment.customer.business?.email;
      const customerName = appointment.customer.person
        ? `${appointment.customer.person.firstName} ${appointment.customer.person.lastName}`
        : appointment.customer.business?.legalName || 'Customer';

      const event: calendar_v3.Schema$Event = {
        summary: `${appointment.title} - ${customerName}`,
        description: appointment.description || `Appointment with ${customerName}`,
        location: undefined, // Appointment model doesn't have location field
        start: {
          dateTime: appointment.startTime.toISOString(),
          timeZone: 'America/Toronto',
        },
        end: {
          dateTime: appointment.endTime
            ? appointment.endTime.toISOString()
            : new Date(appointment.startTime.getTime() + 60 * 60 * 1000).toISOString(),
          timeZone: 'America/Toronto',
        },
        attendees: customerEmail
          ? [
              {
                email: customerEmail,
                displayName: customerName,
              },
            ]
          : undefined,
      };

      await calendar.events.update({
        calendarId: 'primary',
        eventId: appointment.googleCalendarEventId,
        requestBody: event,
        sendUpdates: 'all',
      });

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          googleCalendarSyncedAt: new Date(),
          lastSyncError: null,
        },
      });

      logger.info('Updated Google Calendar event', {
        appointmentId,
        eventId: appointment.googleCalendarEventId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to update Google Calendar event', {
        error,
        appointmentId,
      });

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          lastSyncError: `Failed to update calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      });

      return false;
    }
  }

  /**
   * Cancel/delete Google Calendar event
   */
  async cancelCalendarEvent(
    appointmentId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
      });

      if (!appointment || !appointment.googleCalendarEventId) {
        return false;
      }

      const auth = await googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: appointment.googleCalendarEventId,
        sendUpdates: 'all',
      });

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          googleCalendarEventId: null,
          googleCalendarSyncedAt: new Date(),
          lastSyncError: null,
        },
      });

      logger.info('Cancelled Google Calendar event', {
        appointmentId,
        eventId: appointment.googleCalendarEventId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to cancel Google Calendar event', {
        error,
        appointmentId,
      });

      return false;
    }
  }

  /**
   * Sync appointments with Google Calendar (bidirectional)
   */
  async syncCalendar(
    userId: string,
    organizationId: string,
    options: SyncOptions = {}
  ): Promise<CalendarSyncResult> {
    const result: CalendarSyncResult = {
      success: false,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: [],
    };

    try {
      const isConnected = await googleOAuthService.isConnected(userId);
      if (!isConnected) {
        throw new Error('Google Calendar not connected');
      }

      const auth = await googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      // Get appointments that need syncing
      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId,
          cancelled: false,
          completed: false,
          startTime: {
            gte: options.since || new Date(), // Only future appointments
          },
          ...(options.appointmentIds ? { id: { in: options.appointmentIds } } : {}),
        },
        include: {
          customer: {
            include: {
              person: true,
              business: true,
            },
          },
        },
      });

      // Sync each appointment
      for (const appointment of appointments) {
        try {
          if (!appointment.googleCalendarEventId) {
            // Create new event
            const eventId = await this.createCalendarEvent(appointment.id, userId);
            if (eventId) {
              result.eventsCreated++;
            }
          } else {
            // Update existing event
            const updated = await this.updateCalendarEvent(appointment.id, userId);
            if (updated) {
              result.eventsUpdated++;
            }
          }
        } catch (error) {
          result.errors.push({
            appointmentId: appointment.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update sync timestamp
      await prisma.userGoogleToken.update({
        where: { userId },
        data: {
          lastSyncAt: new Date(),
          lastSyncError: null,
        },
      });

      result.success = true;
      logger.info('Calendar sync completed', {
        userId,
        organizationId,
        ...result,
      });

      return result;
    } catch (error) {
      logger.error('Calendar sync failed', {
        error,
        userId,
        organizationId,
      });

      await prisma.userGoogleToken.update({
        where: { userId },
        data: {
          lastSyncError: error instanceof Error ? error.message : 'Sync failed',
        },
      });

      return result;
    }
  }

  /**
   * Pull events from Google Calendar and create appointments
   */
  async syncFromGoogle(
    userId: string,
    organizationId: string
  ): Promise<number> {
    try {
      const auth = await googleOAuthService.getAuthenticatedClient(userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const now = new Date();
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      const createdCount = 0;

      for (const event of events) {
        if (!event.id || !event.start?.dateTime) {
          continue;
        }

        // Check if we already have this event
        const existing = await prisma.appointment.findFirst({
          where: {
            googleCalendarEventId: event.id,
            organizationId,
          },
        });

        if (existing) {
          continue; // Skip existing events
        }

        // TODO: Create appointment from Google Calendar event
        // This requires additional logic to determine customer, etc.
        logger.info('New Google Calendar event found', {
          eventId: event.id,
          summary: event.summary,
        });
      }

      return createdCount;
    } catch (error) {
      logger.error('Failed to sync from Google Calendar', {
        error,
        userId,
        organizationId,
      });
      return 0;
    }
  }
}

export const googleCalendarSyncService = new GoogleCalendarSyncService();
