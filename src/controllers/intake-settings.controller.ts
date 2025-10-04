/**
 * Intake Settings Controller
 * Handles organization-specific intake form configuration
 */

import { Request, Response } from 'express';
import { intakeSettingsService, IntakeSettingsData } from '../services/intake-settings.service';

/**
 * @openapi
 * /organizations/{organizationId}/settings/intake:
 *   get:
 *     summary: Get intake form settings
 *     description: Retrieve intake form configuration for an organization. Requires ADMIN or MANAGER permission.
 *     tags:
 *       - Organization Settings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: Intake form settings
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Settings not found
 */
export async function getIntakeSettings(req: Request, res: Response): Promise<void> {
  try {
    const { organizationId } = req.params;

    const settings = await intakeSettingsService.getOrCreateSettings(organizationId);
    res.json(settings);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch intake settings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * @openapi
 * /organizations/{organizationId}/settings/intake:
 *   put:
 *     summary: Update intake form settings
 *     description: Update intake form configuration for an organization. Requires ADMIN or MANAGER permission.
 *     tags:
 *       - Organization Settings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               requireApproval:
 *                 type: boolean
 *               notifyOnSubmission:
 *                 type: boolean
 *               notificationEmails:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               customerConfirmationEmail:
 *                 type: boolean
 *               customFields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     label:
 *                       type: string
 *                     type:
 *                       type: string
 *                       enum: [TEXT, NUMBER, EMAIL, PHONE, SELECT, TEXTAREA, DATE]
 *                     required:
 *                       type: boolean
 *                     options:
 *                       type: array
 *                       items:
 *                         type: string
 *                     placeholder:
 *                       type: string
 *                     defaultValue:
 *                       type: string
 *                     order:
 *                       type: number
 *               requiredFields:
 *                 type: array
 *                 items:
 *                   type: string
 *               thankYouMessage:
 *                 type: string
 *               redirectUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export async function updateIntakeSettings(req: Request, res: Response): Promise<void> {
  try {
    const { organizationId } = req.params;
    const updateData: IntakeSettingsData = req.body;

    const settings = await intakeSettingsService.updateSettings(organizationId, updateData);
    res.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid')) {
      res.status(400).json({
        error: 'Invalid intake settings data',
        message: error.message,
      });
    } else {
      res.status(500).json({
        error: 'Failed to update intake settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
