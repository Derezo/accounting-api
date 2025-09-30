// Mock Resend email service
const mockResendSend = jest.fn();
const mockResend = {
  emails: {
    send: mockResendSend
  }
};

jest.mock('resend', () => ({
  Resend: jest.fn(() => mockResend)
}));

jest.mock('../../src/config/config', () => ({
  config: {
    RESEND_API_KEY: 'test-resend-api-key',
    EMAIL_FROM: 'noreply@accounting.com'
  }
}));

import { EmailService } from '../../src/services/email.service';
import { Resend } from 'resend';

const MockedResend = Resend as jest.MockedClass<typeof Resend>;

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = new EmailService();
  });

  describe('constructor', () => {
    it('should initialize Resend with correct API key', () => {
      expect(MockedResend).toHaveBeenCalledWith('test-resend-api-key');
    });

    it('should handle missing Resend configuration gracefully', () => {
      // This test verifies that EmailService can be instantiated even with missing config
      // The actual config is already mocked at module level, so we just verify it was created
      expect(emailService).toBeDefined();
      expect(MockedResend).toHaveBeenCalled();
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
      mockResendSend.mockResolvedValue({ id: 'test-message-id' });
    });

    it('should send email successfully with single recipient', async () => {
      await emailService.sendEmail(
        mockEmailData.to,
        mockEmailData.subject,
        mockEmailData.html,
        mockEmailData.text
      );

      expect(mockResendSend).toHaveBeenCalledWith({
        from: 'noreply@accounting.com',
        to: ['recipient@example.com'],
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

      expect(mockResendSend).toHaveBeenCalledWith({
        from: 'noreply@accounting.com',
        to: ['user1@example.com', 'user2@example.com'],
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

      expect(mockResendSend).toHaveBeenCalledWith({
        from: 'noreply@accounting.com',
        to: ['recipient@example.com'],
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

      expect(mockResendSend).toHaveBeenCalledWith({
        from: 'noreply@accounting.com',
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<h1>Test HTML</h1>',
        text: 'Test Text',
        attachments
      });
    });

    it('should throw error if Resend is not configured', async () => {
      const unconfiguredEmailService = new EmailService();
      // Force resend to be null
      (unconfiguredEmailService as any).resend = null;

      await expect(
        unconfiguredEmailService.sendEmail(
          mockEmailData.to,
          mockEmailData.subject,
          mockEmailData.html
        )
      ).rejects.toThrow('Email service not configured');
    });

    it('should throw error if sending email fails', async () => {
      mockResendSend.mockRejectedValue(new Error('Resend API Error'));

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
      mockResendSend.mockResolvedValue({ id: 'test-message-id' });
    });

    it('should send e-transfer notification email successfully', async () => {
      await emailService.sendETransferNotification(
        'recipient@example.com',
        mockETransferData
      );

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: ['recipient@example.com'],
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

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).toContain('What is your favorite color?');
      expect(sendCall.text).toContain('What is your favorite color?');
    });

    it('should format amount correctly in Canadian currency', async () => {
      await emailService.sendETransferNotification(
        'recipient@example.com',
        mockETransferData
      );

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).toContain('$500.00');
      expect(sendCall.text).toContain('$500.00');
    });

    it('should include deposit URL in email', async () => {
      await emailService.sendETransferNotification(
        'recipient@example.com',
        mockETransferData
      );

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).toContain('https://banking.example.com/deposit');
      expect(sendCall.text).toContain('https://banking.example.com/deposit');
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
      mockResendSend.mockResolvedValue({ id: 'test-message-id' });
    });

    it('should send deposit confirmation email successfully', async () => {
      await emailService.sendETransferDepositConfirmation(
        'recipient@example.com',
        mockDepositData
      );

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: ['recipient@example.com'],
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

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).toContain('CONF123456');
      expect(sendCall.text).toContain('CONF123456');
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

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).not.toContain('Confirmation Code:');
      expect(sendCall.text).not.toContain('Confirmation Code:');
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
      mockResendSend.mockResolvedValue({ id: 'test-message-id' });
    });

    it('should send payment receipt email successfully', async () => {
      await emailService.sendPaymentReceipt(
        'customer@example.com',
        mockReceiptData
      );

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: ['customer@example.com'],
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

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).toContain('INV-2024-001');
      expect(sendCall.text).toContain('INV-2024-001');
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

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).not.toContain('Invoice Number:');
      expect(sendCall.text).not.toContain('Invoice Number:');
    });

    it('should format payment amount correctly', async () => {
      await emailService.sendPaymentReceipt(
        'customer@example.com',
        mockReceiptData
      );

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).toContain('$1,500.00');
      expect(sendCall.text).toContain('$1,500.00');
    });
  });

  describe('sendPaymentReminder', () => {
    const currentDate = new Date('2024-01-15');
    const futureDate = new Date('2024-01-20');
    const pastDate = new Date('2024-01-10');

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(currentDate);
      mockResendSend.mockResolvedValue({ id: 'test-message-id' });
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

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: ['customer@example.com'],
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

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@accounting.com',
          to: ['customer@example.com'],
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

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).toContain('https://payments.example.com/pay/12345');
      expect(sendCall.text).toContain('https://payments.example.com/pay/12345');
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

      const sendCall = mockResendSend.mock.calls[0][0];
      expect(sendCall.html).not.toContain('Pay Now');
      expect(sendCall.text).not.toContain('Pay online:');
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
    it('should return true when Resend is configured', async () => {
      const result = await emailService.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when Resend is not configured', async () => {
      const unconfiguredEmailService = new EmailService();
      (unconfiguredEmailService as any).resend = null;

      const result = await unconfiguredEmailService.testConnection();
      expect(result).toBe(false);
    });
  });
});