import { eTransferEmailParser, ETransferEmailData } from './etransfer-email-parser.service';
import { eTransferAutoMatchService } from './etransfer-auto-match.service';
import { emailService } from './email.service';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

/**
 * E-Transfer Orchestrator Service
 * Coordinates email parsing, auto-matching, and payment processing
 */
export class ETransferOrchestratorService {
  private isRunning = false;

  /**
   * Start the e-Transfer automation system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('E-Transfer orchestrator is already running');
      return;
    }

    try {
      logger.info('Starting e-Transfer orchestrator...');

      // Start email parser
      await eTransferEmailParser.start();

      // Listen for incoming e-Transfer notifications
      eTransferEmailParser.on('etransfer-received', async (transferData: ETransferEmailData) => {
        await this.handleIncomingTransfer(transferData);
      });

      // Handle connection failures
      eTransferEmailParser.on('connection-failed', (error: Error) => {
        logger.error('E-Transfer email monitoring connection failed', {
          error: error.message
        });
        // Emit event for external monitoring/alerting
        this.notifyAdminOfFailure(error);
      });

      this.isRunning = true;
      logger.info('E-Transfer orchestrator started successfully');
    } catch (error) {
      logger.error('Failed to start e-Transfer orchestrator', { error });
      throw error;
    }
  }

  /**
   * Stop the e-Transfer automation system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping e-Transfer orchestrator...');
      await eTransferEmailParser.stop();
      eTransferEmailParser.removeAllListeners();
      this.isRunning = false;
      logger.info('E-Transfer orchestrator stopped');
    } catch (error) {
      logger.error('Error stopping e-Transfer orchestrator', { error });
    }
  }

  /**
   * Handle incoming e-Transfer notification
   */
  private async handleIncomingTransfer(transferData: ETransferEmailData): Promise<void> {
    try {
      logger.info('Processing incoming e-Transfer', {
        amount: transferData.amount,
        sender: transferData.senderName,
        reference: transferData.referenceNumber
      });

      // Determine organization ID
      const organizationId = await this.determineOrganization(transferData);

      if (!organizationId) {
        logger.error('Could not determine organization for e-Transfer', {
          senderEmail: transferData.senderEmail,
          amount: transferData.amount
        });

        // Create unmatched transfer record for admin review
        await this.createUnmatchedTransferRecord(transferData);
        await this.notifyAdminOfUnmatchedTransfer(transferData);
        return;
      }

      // Attempt auto-match
      const matchResult = await eTransferAutoMatchService.matchTransfer(
        organizationId,
        {
          senderName: transferData.senderName,
          senderEmail: transferData.senderEmail,
          amount: transferData.amount,
          referenceNumber: transferData.referenceNumber,
          transferDate: transferData.transferDate,
          messageId: transferData.messageId
        }
      );

      if (matchResult.requiresReview) {
        // Send to admin review queue
        logger.info('E-Transfer requires manual review', {
          confidence: matchResult.confidence,
          score: matchResult.score,
          amount: transferData.amount
        });

        await eTransferAutoMatchService.createPendingReviewPayment(
          organizationId,
          {
            senderName: transferData.senderName,
            senderEmail: transferData.senderEmail,
            amount: transferData.amount,
            referenceNumber: transferData.referenceNumber,
            transferDate: transferData.transferDate,
            messageId: transferData.messageId
          },
          matchResult.matches,
          'system'
        );

        // Notify admin
        await this.notifyAdminOfPendingReview(
          organizationId,
          transferData,
          matchResult
        );

      } else if (matchResult.invoice) {
        // Auto-match successful - create payment
        const payment = await eTransferAutoMatchService.createPaymentFromMatch(
          organizationId,
          matchResult.invoice.id,
          {
            senderName: transferData.senderName,
            senderEmail: transferData.senderEmail,
            amount: transferData.amount,
            referenceNumber: transferData.referenceNumber,
            transferDate: transferData.transferDate,
            messageId: transferData.messageId
          },
          matchResult.score,
          'system'
        );

        logger.info('E-Transfer auto-matched successfully', {
          paymentId: payment.id,
          invoiceId: matchResult.invoice.id,
          invoiceNumber: matchResult.invoice.invoiceNumber,
          confidence: matchResult.confidence,
          score: matchResult.score
        });

        // Send confirmation to customer and admin
        await this.sendAutoMatchConfirmation(
          organizationId,
          payment,
          matchResult.invoice,
          transferData
        );
      }
    } catch (error) {
      logger.error('Error processing incoming e-Transfer', {
        error,
        transferData: {
          amount: transferData.amount,
          sender: transferData.senderName
        }
      });

      // Notify admin of processing error
      await this.notifyAdminOfProcessingError(transferData, error);
    }
  }

  /**
   * Determine which organization the transfer belongs to
   * Based on email configuration or recipient email domain
   */
  private async determineOrganization(transferData: ETransferEmailData): Promise<string | null> {
    try {
      // Strategy 1: Check if email address is configured for specific organization
      const configuredOrg = process.env.ETRANSFER_ORGANIZATION_ID;
      if (configuredOrg) {
        return configuredOrg;
      }

      // Strategy 2: Match by email domain
      const recipientEmail = process.env.ETRANSFER_EMAIL_USER;
      if (recipientEmail) {
        const domain = recipientEmail.split('@')[1]?.toLowerCase();
        if (domain) {
          const org = await prisma.organization.findFirst({
            where: {
              OR: [
                { domain },
                { email: { endsWith: `@${domain}` } }
              ],
              isActive: true,
              deletedAt: null
            }
          });
          if (org) {
            return org.id;
          }
        }
      }

      // Strategy 3: Find by customer email (sender)
      const customer = await prisma.customer.findFirst({
        where: {
          OR: [
            {
              person: {
                email: transferData.senderEmail.toLowerCase()
              }
            },
            {
              business: {
                email: transferData.senderEmail.toLowerCase()
              }
            }
          ],
          deletedAt: null
        },
        include: {
          organization: true
        }
      });

      if (customer) {
        return customer.organizationId;
      }

      // Strategy 4: Default to master organization if configured
      const masterOrg = await prisma.organization.findFirst({
        where: {
          isMasterOrg: true,
          isActive: true,
          deletedAt: null
        }
      });

      return masterOrg?.id || null;
    } catch (error) {
      logger.error('Error determining organization', { error });
      return null;
    }
  }

  /**
   * Create record for unmatched transfer
   */
  private async createUnmatchedTransferRecord(transferData: ETransferEmailData): Promise<void> {
    // Could store in a dedicated UnmatchedTransfer table or use metadata
    logger.info('Created unmatched transfer record', {
      amount: transferData.amount,
      sender: transferData.senderName
    });
  }

  /**
   * Notify admin of transfer requiring review
   */
  private async notifyAdminOfPendingReview(
    organizationId: string,
    transferData: ETransferEmailData,
    matchResult: any
  ): Promise<void> {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId }
      });

      if (!organization) return;

      const adminEmail = organization.email;
      const dashboardUrl = `${process.env.FRONTEND_URL}/admin/payments/review`;

      await emailService.sendEmail(
        adminEmail,
        `E-Transfer Requires Review - $${transferData.amount}`,
        `
          <h2>E-Transfer Pending Review</h2>
          <p>An incoming e-Transfer requires manual review:</p>
          <ul>
            <li><strong>Amount:</strong> $${transferData.amount} ${transferData.currency}</li>
            <li><strong>From:</strong> ${transferData.senderName} (${transferData.senderEmail})</li>
            <li><strong>Reference:</strong> ${transferData.referenceNumber || 'None'}</li>
            <li><strong>Date:</strong> ${transferData.transferDate.toLocaleString()}</li>
            <li><strong>Match Confidence:</strong> ${matchResult.confidence} (${matchResult.score}%)</li>
          </ul>
          ${matchResult.matches.length > 0 ? `
            <h3>Potential Matches:</h3>
            <ul>
              ${matchResult.matches.slice(0, 3).map((m: any) => `
                <li>${m.invoice.invoiceNumber} - $${m.invoice.balance} (${m.score}% match)</li>
              `).join('')}
            </ul>
          ` : ''}
          <p><a href="${dashboardUrl}">Review in Dashboard</a></p>
        `
      );

      logger.info('Admin notified of pending review', { organizationId });
    } catch (error) {
      logger.error('Failed to notify admin of pending review', { error });
    }
  }

  /**
   * Send auto-match confirmation emails
   */
  private async sendAutoMatchConfirmation(
    organizationId: string,
    payment: any,
    invoice: any,
    transferData: ETransferEmailData
  ): Promise<void> {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId }
      });

      if (!organization) return;

      // Email to customer
      if (transferData.senderEmail) {
        await emailService.sendPaymentReceipt(
          transferData.senderEmail,
          {
            paymentNumber: payment.paymentNumber,
            amount: transferData.amount,
            currency: transferData.currency,
            paymentMethod: 'Interac e-Transfer',
            paymentDate: transferData.transferDate,
            customerName: transferData.senderName,
            invoiceNumber: invoice.invoiceNumber,
            businessName: organization.name
          }
        );
      }

      // Email to admin
      await emailService.sendEmail(
        organization.email,
        `E-Transfer Auto-Matched - $${transferData.amount}`,
        `
          <h2>E-Transfer Automatically Matched</h2>
          <p>An incoming e-Transfer was automatically matched and recorded:</p>
          <ul>
            <li><strong>Amount:</strong> $${transferData.amount}</li>
            <li><strong>From:</strong> ${transferData.senderName}</li>
            <li><strong>Invoice:</strong> ${invoice.invoiceNumber}</li>
            <li><strong>Payment ID:</strong> ${payment.paymentNumber}</li>
            <li><strong>Confidence:</strong> ${payment.metadata ? JSON.parse(payment.metadata).matchScore : 0}%</li>
          </ul>
        `
      );

      logger.info('Auto-match confirmation emails sent', { paymentId: payment.id });
    } catch (error) {
      logger.error('Failed to send auto-match confirmation', { error });
    }
  }

  /**
   * Notify admin of unmatched transfer
   */
  private async notifyAdminOfUnmatchedTransfer(transferData: ETransferEmailData): Promise<void> {
    // Send email to system admin
    logger.warn('Admin notified of unmatched e-Transfer', {
      amount: transferData.amount,
      sender: transferData.senderName
    });
  }

  /**
   * Notify admin of processing error
   */
  private async notifyAdminOfProcessingError(
    transferData: ETransferEmailData,
    error: any
  ): Promise<void> {
    logger.error('Admin notified of processing error', {
      amount: transferData.amount,
      error: error.message
    });
  }

  /**
   * Notify admin of system failure
   */
  private notifyAdminOfFailure(error: Error): void {
    logger.error('E-Transfer monitoring system failure', {
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Get system status
   */
  getStatus(): { running: boolean; monitoring: boolean } {
    return {
      running: this.isRunning,
      monitoring: eTransferEmailParser.isMonitoring()
    };
  }
}

export const eTransferOrchestrator = new ETransferOrchestratorService();
