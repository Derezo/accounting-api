/**
 * Intake Settings Service
 * Manages organization-specific intake form configuration
 */

import { PrismaClient, IntakeSettings } from '@prisma/client';

const prisma = new PrismaClient();

export interface IntakeCustomField {
  id: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'EMAIL' | 'PHONE' | 'SELECT' | 'TEXTAREA' | 'DATE';
  required: boolean;
  options?: string[]; // For SELECT type
  placeholder?: string;
  defaultValue?: string;
  order: number;
}

export interface IntakeSettingsData {
  enabled?: boolean;
  requireApproval?: boolean;
  notifyOnSubmission?: boolean;
  notificationEmails?: string[];
  customerConfirmationEmail?: boolean;
  customFields?: IntakeCustomField[];
  requiredFields?: string[];
  thankYouMessage?: string;
  redirectUrl?: string;
}

export interface IntakeSettingsResponse {
  id: string;
  organizationId: string;
  enabled: boolean;
  requireApproval: boolean;
  notifyOnSubmission: boolean;
  notificationEmails: string[];
  customerConfirmationEmail: boolean;
  customFields: IntakeCustomField[];
  requiredFields: string[];
  thankYouMessage?: string;
  redirectUrl?: string;
  createdAt: string;
  updatedAt: string;
}

class IntakeSettingsService {
  /**
   * Get intake settings for an organization
   */
  async getSettings(organizationId: string): Promise<IntakeSettingsResponse | null> {
    const settings = await prisma.intakeSettings.findUnique({
      where: { organizationId },
    });

    if (!settings) {
      return null;
    }

    return this.formatSettings(settings);
  }

  /**
   * Get or create default intake settings for an organization
   */
  async getOrCreateSettings(organizationId: string): Promise<IntakeSettingsResponse> {
    let settings = await prisma.intakeSettings.findUnique({
      where: { organizationId },
    });

    if (!settings) {
      settings = await this.createDefaultSettings(organizationId);
    }

    return this.formatSettings(settings);
  }

  /**
   * Create default intake settings
   */
  private async createDefaultSettings(organizationId: string): Promise<IntakeSettings> {
    // Get organization email for default notification
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { email: true },
    });

    const defaultNotificationEmails = organization?.email ? [organization.email] : [];

    return await prisma.intakeSettings.create({
      data: {
        organizationId,
        enabled: true,
        requireApproval: false,
        notifyOnSubmission: true,
        notificationEmails: JSON.stringify(defaultNotificationEmails),
        customerConfirmationEmail: true,
        customFields: null,
        requiredFields: JSON.stringify(['name', 'email', 'phone']),
        thankYouMessage: 'Thank you for your submission! We will be in touch shortly.',
        redirectUrl: null,
      },
    });
  }

  /**
   * Update intake settings
   */
  async updateSettings(
    organizationId: string,
    updateData: IntakeSettingsData
  ): Promise<IntakeSettingsResponse> {
    // Ensure settings exist
    await this.getOrCreateSettings(organizationId);

    const data: any = {};

    if (updateData.enabled !== undefined) {
      data.enabled = updateData.enabled;
    }

    if (updateData.requireApproval !== undefined) {
      data.requireApproval = updateData.requireApproval;
    }

    if (updateData.notifyOnSubmission !== undefined) {
      data.notifyOnSubmission = updateData.notifyOnSubmission;
    }

    if (updateData.notificationEmails) {
      data.notificationEmails = JSON.stringify(updateData.notificationEmails);
    }

    if (updateData.customerConfirmationEmail !== undefined) {
      data.customerConfirmationEmail = updateData.customerConfirmationEmail;
    }

    if (updateData.customFields) {
      // Validate custom fields
      this.validateCustomFields(updateData.customFields);
      data.customFields = JSON.stringify(updateData.customFields);
    }

    if (updateData.requiredFields) {
      data.requiredFields = JSON.stringify(updateData.requiredFields);
    }

    if (updateData.thankYouMessage !== undefined) {
      data.thankYouMessage = updateData.thankYouMessage;
    }

    if (updateData.redirectUrl !== undefined) {
      data.redirectUrl = updateData.redirectUrl;
    }

    const updated = await prisma.intakeSettings.update({
      where: { organizationId },
      data,
    });

    return this.formatSettings(updated);
  }

  /**
   * Delete intake settings (reset to default)
   */
  async deleteSettings(organizationId: string): Promise<void> {
    await prisma.intakeSettings.delete({
      where: { organizationId },
    });
  }

  /**
   * Validate custom fields structure
   */
  private validateCustomFields(fields: IntakeCustomField[]): void {
    fields.forEach((field, index) => {
      if (!field.id || !field.label || !field.type) {
        throw new Error(
          `Invalid custom field at index ${index}: id, label, and type are required`
        );
      }

      const validTypes = ['TEXT', 'NUMBER', 'EMAIL', 'PHONE', 'SELECT', 'TEXTAREA', 'DATE'];
      if (!validTypes.includes(field.type)) {
        throw new Error(
          `Invalid field type "${field.type}" at index ${index}. Must be one of: ${validTypes.join(', ')}`
        );
      }

      if (field.type === 'SELECT' && (!field.options || field.options.length === 0)) {
        throw new Error(`SELECT field "${field.label}" must have at least one option`);
      }
    });
  }

  /**
   * Format settings for API response
   */
  private formatSettings(settings: IntakeSettings): IntakeSettingsResponse {
    return {
      id: settings.id,
      organizationId: settings.organizationId,
      enabled: settings.enabled,
      requireApproval: settings.requireApproval,
      notifyOnSubmission: settings.notifyOnSubmission,
      notificationEmails: settings.notificationEmails
        ? JSON.parse(settings.notificationEmails)
        : [],
      customerConfirmationEmail: settings.customerConfirmationEmail,
      customFields: settings.customFields ? JSON.parse(settings.customFields) : [],
      requiredFields: settings.requiredFields ? JSON.parse(settings.requiredFields) : [],
      thankYouMessage: settings.thankYouMessage || undefined,
      redirectUrl: settings.redirectUrl || undefined,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}

export const intakeSettingsService = new IntakeSettingsService();
