import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { config } from '../config/config';

/**
 * GoogleMeetService
 * Handles Google Meet link generation for appointments
 * Requires Google OAuth credentials and Calendar API access
 */
export class GoogleMeetService {
  private oauth2Client: any;
  private calendar: any;

  constructor() {
    // Initialize OAuth2 client if credentials are available
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI) {
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      // Set refresh token if available
      if (process.env.GOOGLE_REFRESH_TOKEN) {
        this.oauth2Client.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });
      }

      this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    } else {
      logger.warn('Google Meet integration not configured - missing OAuth credentials');
    }
  }

  /**
   * Check if Google Meet is configured
   */
  public isConfigured(): boolean {
    return !!this.oauth2Client && !!process.env.GOOGLE_REFRESH_TOKEN;
  }

  /**
   * Create a Google Meet link for an appointment
   */
  public async createMeeting(
    appointmentDetails: {
      title: string;
      description?: string;
      startTime: Date;
      endTime: Date;
      customerEmail: string;
      customerName: string;
      organizationEmail: string;
    }
  ): Promise<{ meetingLink: string; meetingId: string; eventId: string }> {
    if (!this.isConfigured()) {
      throw new Error('Google Meet integration is not configured');
    }

    try {
      const event = {
        summary: appointmentDetails.title,
        description: appointmentDetails.description || 'Appointment meeting',
        start: {
          dateTime: appointmentDetails.startTime.toISOString(),
          timeZone: 'America/Toronto' // TODO: Make this configurable per organization
        },
        end: {
          dateTime: appointmentDetails.endTime.toISOString(),
          timeZone: 'America/Toronto'
        },
        attendees: [
          { email: appointmentDetails.customerEmail, displayName: appointmentDetails.customerName },
          { email: appointmentDetails.organizationEmail }
        ],
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`, // Unique request ID
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'email', minutes: 60 }        // 1 hour before
          ]
        }
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        sendUpdates: 'all', // Send email invitations
        resource: event
      });

      const meetingLink = response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri;
      const meetingId = response.data.conferenceData?.conferenceId;
      const eventId = response.data.id;

      if (!meetingLink || !meetingId) {
        throw new Error('Failed to create Google Meet link');
      }

      logger.info('Google Meet link created', {
        meetingId,
        eventId,
        customerEmail: appointmentDetails.customerEmail
      });

      return { meetingLink, meetingId, eventId };
    } catch (error: any) {
      logger.error('Error creating Google Meet link', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to create Google Meet link: ${error.message}`);
    }
  }

  /**
   * Update an existing calendar event
   */
  public async updateMeeting(
    eventId: string,
    updates: {
      title?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
    }
  ): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Google Meet integration is not configured');
    }

    try {
      const updateData: any = {};

      if (updates.title) {
        updateData.summary = updates.title;
      }
      if (updates.description) {
        updateData.description = updates.description;
      }
      if (updates.startTime) {
        updateData.start = {
          dateTime: updates.startTime.toISOString(),
          timeZone: 'America/Toronto'
        };
      }
      if (updates.endTime) {
        updateData.end = {
          dateTime: updates.endTime.toISOString(),
          timeZone: 'America/Toronto'
        };
      }

      await this.calendar.events.patch({
        calendarId: 'primary',
        eventId,
        sendUpdates: 'all',
        resource: updateData
      });

      logger.info('Google Meet event updated', { eventId });
    } catch (error: any) {
      logger.error('Error updating Google Meet event', {
        error: error.message,
        eventId
      });
      throw new Error(`Failed to update Google Meet event: ${error.message}`);
    }
  }

  /**
   * Cancel a calendar event
   */
  public async cancelMeeting(eventId: string, reason?: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Google Meet integration is not configured');
    }

    try {
      // Update event to mark as cancelled with reason
      if (reason) {
        await this.calendar.events.patch({
          calendarId: 'primary',
          eventId,
          sendUpdates: 'all',
          resource: {
            status: 'cancelled',
            description: `Cancelled: ${reason}`
          }
        });
      }

      // Delete the event
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId,
        sendUpdates: 'all'
      });

      logger.info('Google Meet event cancelled', { eventId, reason });
    } catch (error: any) {
      logger.error('Error cancelling Google Meet event', {
        error: error.message,
        eventId
      });
      throw new Error(`Failed to cancel Google Meet event: ${error.message}`);
    }
  }

  /**
   * Generate a fallback meeting link (for when Google Meet is not configured)
   * This could be a Zoom link, custom video solution, or placeholder
   */
  public generateFallbackLink(appointmentId: string): { meetingLink: string; meetingId: string } {
    logger.warn('Using fallback meeting link - Google Meet not configured');

    // TODO: Implement fallback solution (Zoom, Jitsi, etc.)
    // For now, return a placeholder that directs to a booking page
    const meetingLink = `${config.FRONTEND_URL}/appointments/${appointmentId}/join`;
    const meetingId = `fallback-${appointmentId}`;

    return { meetingLink, meetingId };
  }

  /**
   * Get available time slots for appointments
   * Queries Google Calendar for free/busy information
   */
  public async getAvailableSlots(
    startDate: Date,
    endDate: Date,
    duration: number // in minutes
  ): Promise<Array<{ start: Date; end: Date }>> {
    if (!this.isConfigured()) {
      logger.warn('Google Calendar not configured for availability check');
      // Return some default slots if not configured
      return this.generateDefaultSlots(startDate, endDate, duration);
    }

    try {
      const response = await this.calendar.freebusy.query({
        resource: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: 'primary' }]
        }
      });

      const busySlots = response.data.calendars.primary.busy || [];
      const availableSlots = this.calculateAvailableSlots(
        startDate,
        endDate,
        duration,
        busySlots
      );

      return availableSlots;
    } catch (error: any) {
      logger.error('Error fetching available slots', error);
      // Return default slots on error
      return this.generateDefaultSlots(startDate, endDate, duration);
    }
  }

  /**
   * Calculate available slots from busy periods
   */
  private calculateAvailableSlots(
    startDate: Date,
    endDate: Date,
    duration: number,
    busySlots: Array<{ start: string; end: string }>
  ): Array<{ start: Date; end: Date }> {
    const available: Array<{ start: Date; end: Date }> = [];
    const durationMs = duration * 60 * 1000;

    // Business hours: 9 AM to 5 PM
    const businessHourStart = 9;
    const businessHourEnd = 17;

    const currentDate = new Date(startDate);
    currentDate.setHours(businessHourStart, 0, 0, 0);

    while (currentDate < endDate) {
      // Skip weekends
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(businessHourStart, 0, 0, 0);
        continue;
      }

      const dayEnd = new Date(currentDate);
      dayEnd.setHours(businessHourEnd, 0, 0, 0);

      while (currentDate < dayEnd) {
        const slotEnd = new Date(currentDate.getTime() + durationMs);

        if (slotEnd > dayEnd) break;

        // Check if slot overlaps with any busy period
        const isBusy = busySlots.some(busy => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return currentDate < busyEnd && slotEnd > busyStart;
        });

        if (!isBusy) {
          available.push({
            start: new Date(currentDate),
            end: new Date(slotEnd)
          });
        }

        // Move to next slot (every 30 minutes)
        currentDate.setTime(currentDate.getTime() + 30 * 60 * 1000);
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(businessHourStart, 0, 0, 0);
    }

    return available;
  }

  /**
   * Generate default time slots when Calendar API is not available
   */
  private generateDefaultSlots(
    startDate: Date,
    endDate: Date,
    duration: number
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = [];
    const durationMs = duration * 60 * 1000;

    // Business hours: 9 AM to 5 PM
    const businessHourStart = 9;
    const businessHourEnd = 17;

    const currentDate = new Date(startDate);
    currentDate.setHours(businessHourStart, 0, 0, 0);

    while (currentDate < endDate && slots.length < 20) { // Limit to 20 slots
      // Skip weekends
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(businessHourStart, 0, 0, 0);
        continue;
      }

      const dayEnd = new Date(currentDate);
      dayEnd.setHours(businessHourEnd, 0, 0, 0);

      while (currentDate < dayEnd) {
        const slotEnd = new Date(currentDate.getTime() + durationMs);

        if (slotEnd > dayEnd) break;

        slots.push({
          start: new Date(currentDate),
          end: new Date(slotEnd)
        });

        // Every hour
        currentDate.setTime(currentDate.getTime() + 60 * 60 * 1000);
      }

      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(businessHourStart, 0, 0, 0);
    }

    return slots;
  }
}

export const googleMeetService = new GoogleMeetService();