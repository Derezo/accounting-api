// @ts-nocheck
import nodemailer from 'nodemailer';
import { config } from '../config/config';
import { ETransferNotificationData } from './etransfer.service';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD) {
      console.warn('Email service not configured - SMTP settings missing');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASSWORD
      }
    });
  }

  async sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    text?: string,
    attachments?: any[]
  ): Promise<void> {
    if (!this.transporter) {
      throw new Error('Email service not configured');
    }

    const mailOptions = {
      from: config.EMAIL_FROM || config.SMTP_USER,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: text || this.htmlToText(html),
      attachments
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new Error('Failed to send email notification');
    }
  }

  async sendETransferNotification(
    recipientEmail: string,
    data: ETransferNotificationData
  ): Promise<void> {
    const template = this.generateETransferTemplate(data);

    await this.sendEmail(
      recipientEmail,
      template.subject,
      template.html,
      template.text
    );
  }

  async sendETransferDepositConfirmation(
    recipientEmail: string,
    data: {
      etransferNumber: string;
      amount: number;
      currency: string;
      depositedAt: Date;
      confirmationCode?: string;
    }
  ): Promise<void> {
    const template = this.generateDepositConfirmationTemplate(data);

    await this.sendEmail(
      recipientEmail,
      template.subject,
      template.html,
      template.text
    );
  }

  async sendPaymentReceipt(
    recipientEmail: string,
    data: {
      paymentNumber: string;
      amount: number;
      currency: string;
      paymentMethod: string;
      paymentDate: Date;
      customerName: string;
      invoiceNumber?: string;
      businessName: string;
    }
  ): Promise<void> {
    const template = this.generatePaymentReceiptTemplate(data);

    await this.sendEmail(
      recipientEmail,
      template.subject,
      template.html,
      template.text
    );
  }

  async sendPaymentReminder(
    recipientEmail: string,
    data: {
      customerName: string;
      invoiceNumber: string;
      amount: number;
      currency: string;
      dueDate: Date;
      businessName: string;
      paymentUrl?: string;
    }
  ): Promise<void> {
    const template = this.generatePaymentReminderTemplate(data);

    await this.sendEmail(
      recipientEmail,
      template.subject,
      template.html,
      template.text
    );
  }

  private generateETransferTemplate(data: ETransferNotificationData): EmailTemplate {
    const formattedAmount = new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: data.currency
    }).format(data.amount);

    const formattedExpiry = data.expiryDate.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const subject = `You've received an Interac e-Transfer from ${data.senderName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Interac e-Transfer Notification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0066cc; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
          .amount { font-size: 24px; font-weight: bold; color: #0066cc; text-align: center; margin: 20px 0; }
          .details { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .security-info { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; background-color: #0066cc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
          .warning { color: #d63384; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>💸 Interac e-Transfer</h1>
          <p>Reference: ${data.etransferNumber}</p>
        </div>

        <div class="content">
          <p>Hello,</p>

          <p>You have received an Interac e-Transfer from <strong>${data.senderName}</strong>.</p>

          <div class="amount">${formattedAmount}</div>

          <div class="details">
            <h3>Transfer Details</h3>
            <p><strong>Reference Number:</strong> ${data.etransferNumber}</p>
            <p><strong>Amount:</strong> ${formattedAmount}</p>
            <p><strong>From:</strong> ${data.senderName}</p>
            ${data.message ? `<p><strong>Message:</strong> ${data.message}</p>` : ''}
            <p><strong>Expires:</strong> ${formattedExpiry}</p>
          </div>

          ${data.securityQuestion ? `
          <div class="security-info">
            <h3>Security Question</h3>
            <p><strong>Question:</strong> ${data.securityQuestion}</p>
            <p>You'll need to answer this question when depositing the funds.</p>
          </div>
          ` : ''}

          <div style="text-align: center;">
            <a href="${data.depositUrl}" class="button">Deposit Funds</a>
          </div>

          <div class="warning">
            <p><strong>Important:</strong></p>
            <ul>
              <li>This e-Transfer expires on ${formattedExpiry}</li>
              <li>Only deposit through your trusted banking app or website</li>
              <li>Never share your banking information via email</li>
              <li>If you suspect fraud, contact your bank immediately</li>
            </ul>
          </div>
        </div>

        <div class="footer">
          <p>This is an automated message from the Interac e-Transfer service.</p>
          <p>Do not reply to this email.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
You've received an Interac e-Transfer

Reference: ${data.etransferNumber}
Amount: ${formattedAmount}
From: ${data.senderName}
${data.message ? `Message: ${data.message}` : ''}
Expires: ${formattedExpiry}

${data.securityQuestion ? `Security Question: ${data.securityQuestion}` : ''}

To deposit: ${data.depositUrl}

IMPORTANT: This e-Transfer expires on ${formattedExpiry}. Only deposit through your trusted banking app or website.
    `;

    return { subject, html, text };
  }

  private generateDepositConfirmationTemplate(data: {
    etransferNumber: string;
    amount: number;
    currency: string;
    depositedAt: Date;
    confirmationCode?: string;
  }): EmailTemplate {
    const formattedAmount = new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: data.currency
    }).format(data.amount);

    const formattedDate = data.depositedAt.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const subject = `e-Transfer Deposited Successfully - ${data.etransferNumber}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .content { padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
          .amount { font-size: 24px; font-weight: bold; color: #28a745; text-align: center; margin: 20px 0; }
          .details { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>✅ Deposit Confirmed</h1>
        </div>

        <div class="content">
          <p>Your Interac e-Transfer has been successfully deposited.</p>

          <div class="amount">${formattedAmount}</div>

          <div class="details">
            <h3>Deposit Details</h3>
            <p><strong>Reference Number:</strong> ${data.etransferNumber}</p>
            <p><strong>Amount:</strong> ${formattedAmount}</p>
            <p><strong>Deposited:</strong> ${formattedDate}</p>
            ${data.confirmationCode ? `<p><strong>Confirmation Code:</strong> ${data.confirmationCode}</p>` : ''}
          </div>

          <p>The funds should appear in your account within 1-2 business days.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
e-Transfer Deposited Successfully

Reference: ${data.etransferNumber}
Amount: ${formattedAmount}
Deposited: ${formattedDate}
${data.confirmationCode ? `Confirmation Code: ${data.confirmationCode}` : ''}

The funds should appear in your account within 1-2 business days.
    `;

    return { subject, html, text };
  }

  private generatePaymentReceiptTemplate(data: {
    paymentNumber: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentDate: Date;
    customerName: string;
    invoiceNumber?: string;
    businessName: string;
  }): EmailTemplate {
    const formattedAmount = new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: data.currency
    }).format(data.amount);

    const formattedDate = data.paymentDate.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = `Payment Receipt - ${data.paymentNumber}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0066cc; color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .content { padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
          .amount { font-size: 24px; font-weight: bold; color: #0066cc; text-align: center; margin: 20px 0; }
          .details { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🧾 Payment Receipt</h1>
          <p>${data.businessName}</p>
        </div>

        <div class="content">
          <p>Dear ${data.customerName},</p>

          <p>Thank you for your payment. This email serves as your receipt.</p>

          <div class="amount">${formattedAmount}</div>

          <div class="details">
            <h3>Payment Details</h3>
            <p><strong>Receipt Number:</strong> ${data.paymentNumber}</p>
            <p><strong>Amount Paid:</strong> ${formattedAmount}</p>
            <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
            <p><strong>Payment Date:</strong> ${formattedDate}</p>
            ${data.invoiceNumber ? `<p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>` : ''}
          </div>

          <p>Please keep this receipt for your records.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
Payment Receipt - ${data.businessName}

Dear ${data.customerName},

Thank you for your payment. This email serves as your receipt.

Receipt Number: ${data.paymentNumber}
Amount Paid: ${formattedAmount}
Payment Method: ${data.paymentMethod}
Payment Date: ${formattedDate}
${data.invoiceNumber ? `Invoice Number: ${data.invoiceNumber}` : ''}

Please keep this receipt for your records.
    `;

    return { subject, html, text };
  }

  private generatePaymentReminderTemplate(data: {
    customerName: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    dueDate: Date;
    businessName: string;
    paymentUrl?: string;
  }): EmailTemplate {
    const formattedAmount = new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: data.currency
    }).format(data.amount);

    const formattedDueDate = data.dueDate.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const isOverdue = new Date() > data.dueDate;
    const subject = isOverdue
      ? `Overdue Payment Reminder - Invoice ${data.invoiceNumber}`
      : `Payment Reminder - Invoice ${data.invoiceNumber}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${isOverdue ? '#dc3545' : '#ffc107'}; color: ${isOverdue ? 'white' : '#333'}; padding: 20px; border-radius: 8px; text-align: center; }
          .content { padding: 30px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
          .amount { font-size: 24px; font-weight: bold; color: ${isOverdue ? '#dc3545' : '#ffc107'}; text-align: center; margin: 20px 0; }
          .details { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; background-color: #0066cc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${isOverdue ? '⚠️ Overdue Payment' : '📋 Payment Reminder'}</h1>
          <p>${data.businessName}</p>
        </div>

        <div class="content">
          <p>Dear ${data.customerName},</p>

          <p>This is a ${isOverdue ? 'reminder that your payment is overdue' : 'friendly reminder about your upcoming payment'}.</p>

          <div class="amount">${formattedAmount}</div>

          <div class="details">
            <h3>Invoice Details</h3>
            <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
            <p><strong>Amount Due:</strong> ${formattedAmount}</p>
            <p><strong>Due Date:</strong> ${formattedDueDate}</p>
            ${isOverdue ? '<p style="color: #dc3545;"><strong>Status: OVERDUE</strong></p>' : ''}
          </div>

          ${data.paymentUrl ? `
          <div style="text-align: center;">
            <a href="${data.paymentUrl}" class="button">Pay Now</a>
          </div>
          ` : ''}

          <p>If you have already made this payment, please disregard this notice. If you have any questions, please contact us.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
${isOverdue ? 'Overdue Payment Reminder' : 'Payment Reminder'} - ${data.businessName}

Dear ${data.customerName},

This is a ${isOverdue ? 'reminder that your payment is overdue' : 'friendly reminder about your upcoming payment'}.

Invoice Number: ${data.invoiceNumber}
Amount Due: ${formattedAmount}
Due Date: ${formattedDueDate}
${isOverdue ? 'Status: OVERDUE' : ''}

${data.paymentUrl ? `Pay online: ${data.paymentUrl}` : ''}

If you have already made this payment, please disregard this notice.
    `;

    return { subject, html, text };
  }

  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service test failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();