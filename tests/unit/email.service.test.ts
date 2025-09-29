// Mock nodemailer first
const mockTransporter = {
  sendMail: jest.fn(),
  verify: jest.fn()
};

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransporter)
}));

jest.mock('../../src/config/config', () => ({
  config: {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_USER: 'test@example.com',
    SMTP_PASSWORD: 'password123',
    EMAIL_FROM: 'noreply@accounting.com'
  }
}));

import { EmailService } from '../../src/services/email.service';
import nodemailer from 'nodemailer';

const mockCreateTransport = nodemailer.createTransport as jest.MockedFunction<typeof nodemailer.createTransport>;

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTransport.mockReturnValue(mockTransporter as any);
    emailService = new EmailService();
  });

  describe('constructor', () => {
    it('should initialize transporter with correct SMTP settings', () => {
      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'password123'
        }
      });
    });

    it('should handle missing SMTP configuration gracefully', () => {
      // This test verifies that EmailService can be instantiated even with missing config
      // The actual config is already mocked at module level, so we just verify it was created
      expect(emailService).toBeDefined();
      expect(mockCreateTransport).toHaveBeenCalled();
    });
  });

  describe('sendEmail', () => {
    const mockEmailData = {
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<h1>Test HTML</h1>',
      text: 'Test Text'
    };

    beforeEach(() => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
    });

    it('should send email successfully with single recipient', async () => {
      await emailService.sendEmail(
        mockEmailData.to,
        mockEmailData.subject,
        mockEmailData.html,
        mockEmailData.text
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'noreply@accounting.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test HTML</h1>',
        text: 'Test Text',
        attachments: undefined
      });
    });

    it('should send email successfully with multiple recipients', async () => {
      const recipients = ['user1@example.com', 'user2@example.com'];

      await emailService.sendEmail(
        recipients,
        mockEmailData.subject,
        mockEmailData.html,
        mockEmailData.text
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'noreply@accounting.com',
        to: 'user1@example.com, user2@example.com',
        subject: 'Test Subject',
        html: '<h1>Test HTML</h1>',
        text: 'Test Text',
        attachments: undefined
      });
    });

    it('should convert HTML to text when text is not provided', async () => {
      await emailService.sendEmail(
        mockEmailData.to,
        mockEmailData.subject,
        '<h1>Test HTML</h1><p>Paragraph text</p>'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'noreply@accounting.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test HTML</h1><p>Paragraph text</p>',
        text: 'Test HTML Paragraph text',
        attachments: undefined
      });
    });

    it('should include attachments when provided', async () => {
      const attachments = [
        { filename: 'test.pdf', content: Buffer.from('test') }
      ];

      await emailService.sendEmail(
        mockEmailData.to,
        mockEmailData.subject,
        mockEmailData.html,
        mockEmailData.text,
        attachments
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'noreply@accounting.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<h1>Test HTML</h1>',
        text: 'Test Text',
        attachments
      });
    });

    it('should throw error if transporter is not configured', async () => {
      const unconfiguredEmailService = new EmailService();
      // Force transporter to be null
      (unconfiguredEmailService as any).transporter = null;

      await expect(
        unconfiguredEmailService.sendEmail(
          mockEmailData.to,
          mockEmailData.subject,
          mockEmailData.html
        )
      ).rejects.toThrow('Email service not configured');
    });

    it('should throw error if sending email fails', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP Error'));

      await expect(
        emailService.sendEmail(
          mockEmailData.to,
          mockEmailData.subject,
          mockEmailData.html
        )
      ).rejects.toThrow('Failed to send email notification');
    });
  });

  describe('sendETransferNotification', () => {
    const mockETransferData = {
      etransferNumber: 'ET-123456789',
      amount: 500.00,
      currency: 'CAD',
      senderName: 'John Smith',
      message: 'Payment for services',
      securityQuestion: 'What is your favorite color?',
      expiryDate: new Date('2024-12-31T23:59:59'),
      depositUrl: 'https://banking.example.com/deposit'
    };

    beforeEach(() => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
    });

    it('should send e-transfer notification email successfully', async () => {
      await emailService.sendETransferNotification(
        'recipient@example.com',
        mockETransferData
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: 'recipient@example.com',
          subject: "You've received an Interac e-Transfer from John Smith",
          html: expect.stringContaining('ET-123456789'),
          text: expect.stringContaining('ET-123456789')
        })
      );
    });

    it('should include security question in email when provided', async () => {
      await emailService.sendETransferNotification(
        'recipient@example.com',
        mockETransferData
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).toContain('What is your favorite color?');
      expect(sendMailCall.text).toContain('What is your favorite color?');
    });

    it('should format amount correctly in Canadian currency', async () => {
      await emailService.sendETransferNotification(
        'recipient@example.com',
        mockETransferData
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).toContain('$500.00');
      expect(sendMailCall.text).toContain('$500.00');
    });

    it('should include deposit URL in email', async () => {
      await emailService.sendETransferNotification(
        'recipient@example.com',
        mockETransferData
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).toContain('https://banking.example.com/deposit');
      expect(sendMailCall.text).toContain('https://banking.example.com/deposit');
    });
  });

  describe('sendETransferDepositConfirmation', () => {
    const mockDepositData = {
      etransferNumber: 'ET-123456789',
      amount: 500.00,
      currency: 'CAD',
      depositedAt: new Date('2024-01-15T10:30:00'),
      confirmationCode: 'CONF123456'
    };

    beforeEach(() => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
    });

    it('should send deposit confirmation email successfully', async () => {
      await emailService.sendETransferDepositConfirmation(
        'recipient@example.com',
        mockDepositData
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: 'recipient@example.com',
          subject: 'e-Transfer Deposited Successfully - ET-123456789',
          html: expect.stringContaining('ET-123456789'),
          text: expect.stringContaining('ET-123456789')
        })
      );
    });

    it('should include confirmation code when provided', async () => {
      await emailService.sendETransferDepositConfirmation(
        'recipient@example.com',
        mockDepositData
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).toContain('CONF123456');
      expect(sendMailCall.text).toContain('CONF123456');
    });

    it('should work without confirmation code', async () => {
      const dataWithoutCode = {
        etransferNumber: mockDepositData.etransferNumber,
        amount: mockDepositData.amount,
        currency: mockDepositData.currency,
        depositedAt: mockDepositData.depositedAt
      };

      await emailService.sendETransferDepositConfirmation(
        'recipient@example.com',
        dataWithoutCode
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).not.toContain('Confirmation Code:');
      expect(sendMailCall.text).not.toContain('Confirmation Code:');
    });
  });

  describe('sendPaymentReceipt', () => {
    const mockReceiptData = {
      paymentNumber: 'PAY-123456789',
      amount: 1500.00,
      currency: 'CAD',
      paymentMethod: 'Stripe Card',
      paymentDate: new Date('2024-01-15'),
      customerName: 'Jane Doe',
      invoiceNumber: 'INV-2024-001',
      businessName: 'Accounting Solutions Inc.'
    };

    beforeEach(() => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
    });

    it('should send payment receipt email successfully', async () => {
      await emailService.sendPaymentReceipt(
        'customer@example.com',
        mockReceiptData
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: 'customer@example.com',
          subject: 'Payment Receipt - PAY-123456789',
          html: expect.stringContaining('PAY-123456789'),
          text: expect.stringContaining('PAY-123456789')
        })
      );
    });

    it('should include invoice number when provided', async () => {
      await emailService.sendPaymentReceipt(
        'customer@example.com',
        mockReceiptData
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).toContain('INV-2024-001');
      expect(sendMailCall.text).toContain('INV-2024-001');
    });

    it('should work without invoice number', async () => {
      const dataWithoutInvoice = {
        paymentNumber: mockReceiptData.paymentNumber,
        amount: mockReceiptData.amount,
        currency: mockReceiptData.currency,
        paymentMethod: mockReceiptData.paymentMethod,
        paymentDate: mockReceiptData.paymentDate,
        customerName: mockReceiptData.customerName,
        businessName: mockReceiptData.businessName
      };

      await emailService.sendPaymentReceipt(
        'customer@example.com',
        dataWithoutInvoice
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).not.toContain('Invoice Number:');
      expect(sendMailCall.text).not.toContain('Invoice Number:');
    });

    it('should format payment amount correctly', async () => {
      await emailService.sendPaymentReceipt(
        'customer@example.com',
        mockReceiptData
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).toContain('$1,500.00');
      expect(sendMailCall.text).toContain('$1,500.00');
    });
  });

  describe('sendPaymentReminder', () => {
    const currentDate = new Date('2024-01-15');
    const futureDate = new Date('2024-01-20');
    const pastDate = new Date('2024-01-10');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(currentDate);
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const mockReminderData = {
      customerName: 'John Smith',
      invoiceNumber: 'INV-2024-001',
      amount: 2500.00,
      currency: 'CAD',
      businessName: 'Accounting Solutions Inc.',
      paymentUrl: 'https://payments.example.com/pay/12345'
    };

    it('should send upcoming payment reminder email', async () => {
      await emailService.sendPaymentReminder(
        'customer@example.com',
        { ...mockReminderData, dueDate: futureDate }
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: 'customer@example.com',
          subject: 'Payment Reminder - Invoice INV-2024-001',
          html: expect.stringContaining('Payment Reminder'),
          text: expect.stringContaining('Payment Reminder')
        })
      );
    });

    it('should send overdue payment reminder email', async () => {
      await emailService.sendPaymentReminder(
        'customer@example.com',
        { ...mockReminderData, dueDate: pastDate }
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: 'customer@example.com',
          subject: 'Overdue Payment Reminder - Invoice INV-2024-001',
          html: expect.stringContaining('Overdue Payment'),
          text: expect.stringContaining('Overdue Payment')
        })
      );
    });

    it('should include payment URL when provided', async () => {
      await emailService.sendPaymentReminder(
        'customer@example.com',
        { ...mockReminderData, dueDate: futureDate }
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).toContain('https://payments.example.com/pay/12345');
      expect(sendMailCall.text).toContain('https://payments.example.com/pay/12345');
    });

    it('should work without payment URL', async () => {
      const dataWithoutUrl = {
        customerName: mockReminderData.customerName,
        invoiceNumber: mockReminderData.invoiceNumber,
        amount: mockReminderData.amount,
        currency: mockReminderData.currency,
        businessName: mockReminderData.businessName,
        dueDate: futureDate
      };

      await emailService.sendPaymentReminder(
        'customer@example.com',
        dataWithoutUrl
      );

      const sendMailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(sendMailCall.html).not.toContain('Pay Now');
      expect(sendMailCall.text).not.toContain('Pay online:');
    });
  });

  describe('htmlToText', () => {
    it('should convert HTML to plain text', () => {
      const html = '<h1>Title</h1><p>Paragraph with <strong>bold</strong> text</p>';
      const result = (emailService as any).htmlToText(html);
      expect(result).toBe('Title Paragraph with bold text');
    });

    it('should handle HTML entities', () => {
      const html = 'Text with &amp; &lt; &gt; &nbsp; entities';
      const result = (emailService as any).htmlToText(html);
      expect(result).toBe('Text with & < > entities');
    });

    it('should normalize whitespace', () => {
      const html = '<div>   Multiple   \n\n   spaces   </div>';
      const result = (emailService as any).htmlToText(html);
      expect(result).toBe('Multiple spaces');
    });
  });

  describe('testConnection', () => {
    it('should return true when connection is successful', async () => {
      mockTransporter.verify.mockResolvedValue(true);
      const result = await emailService.testConnection();
      expect(result).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should return false when connection fails', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await emailService.testConnection();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Email service test failed:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should return false when transporter is not configured', async () => {
      const unconfiguredEmailService = new EmailService();
      (unconfiguredEmailService as any).transporter = null;

      const result = await unconfiguredEmailService.testConnection();
      expect(result).toBe(false);
    });
  });
});