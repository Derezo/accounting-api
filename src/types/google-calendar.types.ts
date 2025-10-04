/**
 * TypeScript type definitions for Google Calendar integration
 */

import { calendar_v3 } from 'googleapis';

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: Date;
  scope: string;
}

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
  conferenceData?: calendar_v3.Schema$ConferenceData;
}

export interface CalendarSyncResult {
  success: boolean;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  errors: Array<{
    appointmentId: string;
    error: string;
  }>;
}

export interface GoogleOAuthState {
  userId: string;
  organizationId: string;
  returnUrl?: string;
  nonce: string;
  timestamp: number;
}

export type SyncDirection = 'TO_GOOGLE' | 'FROM_GOOGLE' | 'BIDIRECTIONAL';

export interface SyncOptions {
  direction?: SyncDirection;
  since?: Date;
  appointmentIds?: string[];
  forceSync?: boolean;
}
