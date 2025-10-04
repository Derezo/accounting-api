import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

/**
 * E-Transfer data extracted from email
 */
export interface ETransferEmailData {
  senderName: string;
  senderEmail: string;
  amount: number;
  currency: string;
  referenceNumber: string;
  transferDate: Date;
  messageId: string;
  rawEmail: string;
}

/**
 * E-Transfer Email Parser Service
 * Monitors inbox for Interac e-Transfer notification emails and parses payment data
 */
export class ETransferEmailParserService extends EventEmitter {
  private imap: Imap | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000; // 5 seconds

  /**
   * Initialize IMAP connection
   */
  private initializeImap(): void {
    const user = process.env.ETRANSFER_EMAIL_USER;
    const password = process.env.ETRANSFER_EMAIL_PASSWORD;
    const host = process.env.ETRANSFER_EMAIL_HOST || 'imap.gmail.com';
    const port = parseInt(process.env.ETRANSFER_EMAIL_PORT || '993');

    if (!user || !password) {
      logger.warn('E-Transfer email monitoring not configured - credentials missing');
      return;
    }

    this.imap = new Imap({
      user,
      password,
      host,
      port,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      keepalive: {
        interval: 10000,
        idleInterval: 300000,
        forceNoop: true
      }
    });

    this.setupEventHandlers();
  }

  /**
   * Start monitoring inbox for e-Transfer emails
   */
  async start(): Promise<void> {
    if (!process.env.ETRANSFER_EMAIL_USER || !process.env.ETRANSFER_EMAIL_PASSWORD) {
      logger.info('E-Transfer email monitoring disabled - credentials not configured');
      return;
    }

    if (!this.imap) {
      this.initializeImap();
    }

    if (!this.imap) {
      throw new Error('Failed to initialize IMAP connection');
    }

    return new Promise((resolve, reject) => {
      if (!this.imap) {
        reject(new Error('IMAP not initialized'));
        return;
      }

      this.imap.once('ready', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        logger.info('E-Transfer email monitoring started - IMAP connected');
        this.openInbox();
        resolve();
      });

      this.imap.once('error', (err: Error) => {
        logger.error('IMAP connection error', { error: err.message });
        this.handleConnectionError(err);
        reject(err);
      });

      this.imap.connect();
    });
  }

  /**
   * Stop monitoring inbox
   */
  async stop(): Promise<void> {
    if (this.imap && this.isConnected) {
      this.imap.end();
      this.isConnected = false;
      this.imap = null;
      logger.info('E-Transfer email monitoring stopped');
    }
  }

  /**
   * Open inbox and watch for new emails
   */
  private openInbox(): void {
    if (!this.imap) return;

    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        logger.error('Failed to open inbox', { error: err.message });
        return;
      }

      logger.info('Inbox opened successfully', { messages: box.messages.total });

      // Listen for new emails
      if (this.imap) {
        this.imap.on('mail', () => {
          this.processNewEmails();
        });
      }

      // Process existing unread emails on startup
      this.processNewEmails();
    });
  }

  /**
   * Process new unread emails
   */
  private async processNewEmails(): Promise<void> {
    if (!this.imap || !this.isConnected) {
      return;
    }

    try {
      // Search for unread emails from Interac
      const searchCriteria = [
        'UNSEEN',
        ['FROM', 'notify@payments.interac.ca']
      ];

      this.imap.search(searchCriteria, (err, results) => {
        if (err) {
          logger.error('Email search error', { error: err.message });
          return;
        }

        if (!results || results.length === 0) {
          return;
        }

        logger.info(`Found ${results.length} unread e-Transfer notifications`);

        if (!this.imap) return;
        const fetch = this.imap.fetch(results, { bodies: '', markSeen: false });
        fetch.on('message', (msg, seqno) => {
          msg.on('body', (stream) => {
            simpleParser(stream).then((parsed) => {
              try {
                const eTransfer = this.parseETransferEmail(parsed);

                if (eTransfer) {
                  logger.info('E-Transfer email parsed successfully', {
                    amount: eTransfer.amount,
                    sender: eTransfer.senderName,
                    reference: eTransfer.referenceNumber
                  });

                  this.emit('etransfer-received', eTransfer);

                  // Mark as seen after successful processing
                  if (this.imap) {
                    this.imap.addFlags(seqno, ['\\Seen'], (flagErr) => {
                      if (flagErr) {
                        logger.error('Failed to mark email as seen', { error: flagErr.message });
                      }
                    });
                  }
                }
              } catch (error) {
                logger.error('Error processing email message', { error, seqno });
              }
            }).catch((error) => {
              logger.error('Error parsing email', { error, seqno });
            });
          });

          msg.once('attributes', (attrs) => {
            logger.debug('Email attributes', { seqno, uid: attrs.uid });
          });

          msg.once('end', () => {
            logger.debug('Email message end', { seqno });
          });
        });

        fetch.once('error', (fetchErr) => {
          logger.error('Fetch error', { error: fetchErr.message });
        });

        fetch.once('end', () => {
          logger.debug('Fetch completed');
        });
      });
    } catch (error) {
      logger.error('Error processing emails', { error });
    }
  }

  /**
   * Parse Interac e-Transfer notification email
   * Supports various Canadian bank email formats
   */
  private parseETransferEmail(email: ParsedMail): ETransferEmailData | null {
    try {
      const html = email.html || '';
      const text = email.text || '';
      const subject = email.subject || '';

      // Verify this is an Interac e-Transfer email
      if (!this.isInteracEmail(email)) {
        logger.debug('Email is not an Interac e-Transfer notification');
        return null;
      }

      // Parse amount - various formats:
      // "$1,234.56 CAD"
      // "CA$1,234.56"
      // "$1234.56"
      // "1,234.56 CAD"
      const amountMatch = text.match(/(?:CA)?\$?\s?([\d,]+\.?\d{0,2})\s*(?:CAD|USD|CA)?/i);
      if (!amountMatch) {
        logger.warn('Could not parse amount from e-Transfer email', { subject });
        return null;
      }

      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) {
        logger.warn('Invalid amount in e-Transfer email', { amountMatch: amountMatch[1] });
        return null;
      }

      // Determine currency (default to CAD for Canadian transfers)
      const currency = text.match(/USD/i) ? 'USD' : 'CAD';

      // Parse sender name - multiple patterns:
      // "From [Name]"
      // "Sent by [Name]"
      // "[Name] sent you"
      // "[Name] has sent"
      const senderPatterns = [
        /(?:From|Sent by|Sender:)\s+([A-Za-z\s\-']+?)(?:\n|sent|has|$)/i,
        /([A-Za-z\s\-']+?)\s+(?:sent you|has sent)/i,
        /Name:\s*([A-Za-z\s\-']+)/i
      ];

      let senderName = 'Unknown Sender';
      for (const pattern of senderPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          senderName = match[1].trim();
          break;
        }
      }

      // Parse reference/message - what the customer included
      // Patterns: "Message:", "Reference:", "Memo:", "Note:"
      const refPatterns = [
        /(?:Message|Reference|Memo|Note):\s*([^\n]+)/i,
        /Personal\s+message:\s*([^\n]+)/i,
        /Question:\s*([^\n]+)/i
      ];

      let referenceNumber = '';
      for (const pattern of refPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          referenceNumber = match[1].trim();
          break;
        }
      }

      // Use message ID as fallback reference if customer didn't provide one
      if (!referenceNumber && email.messageId) {
        referenceNumber = `MSG-${email.messageId.substring(0, 20)}`;
      }

      // Parse date - prefer email date
      const transferDate = email.date || new Date();

      // Get sender email
      const senderEmail = email.from?.value[0]?.address || 'notify@payments.interac.ca';

      return {
        senderName,
        senderEmail,
        amount,
        currency,
        referenceNumber,
        transferDate,
        messageId: email.messageId || `unknown-${Date.now()}`,
        rawEmail: html || text
      };
    } catch (error) {
      logger.error('Error parsing e-Transfer email', { error });
      return null;
    }
  }

  /**
   * Verify email is from Interac e-Transfer system
   */
  private isInteracEmail(email: ParsedMail): boolean {
    const from = email.from?.value[0]?.address?.toLowerCase() || '';
    const subject = email.subject?.toLowerCase() || '';

    const validSenders = [
      'notify@payments.interac.ca',
      'interac@notify.interac.ca',
      'etransfer@interac.ca'
    ];

    const validSubjectKeywords = [
      'interac',
      'e-transfer',
      'etransfer',
      'money transfer',
      'sent you'
    ];

    const isFromInterac = validSenders.some(sender => from.includes(sender));
    const hasInteracSubject = validSubjectKeywords.some(keyword =>
      subject.includes(keyword.toLowerCase())
    );

    return isFromInterac || hasInteracSubject;
  }

  /**
   * Setup IMAP event handlers
   */
  private setupEventHandlers(): void {
    if (!this.imap) return;

    this.imap.once('close', () => {
      logger.info('IMAP connection closed');
      this.isConnected = false;
      this.handleConnectionClose();
    });

    this.imap.on('error', (err: Error) => {
      logger.error('IMAP error', { error: err.message });
      this.handleConnectionError(err);
    });

    this.imap.on('end', () => {
      logger.info('IMAP connection ended');
      this.isConnected = false;
    });
  }

  /**
   * Handle connection errors with exponential backoff retry
   */
  private handleConnectionError(error: Error): void {
    this.isConnected = false;

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnection attempts reached. Email monitoring stopped.', {
        attempts: this.reconnectAttempts
      });
      this.emit('connection-failed', error);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`, {
      delay: `${delay}ms`
    });

    setTimeout(() => {
      this.start().catch(err => {
        logger.error('Reconnection failed', { error: err.message });
      });
    }, delay);
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(): void {
    if (!this.isConnected) {
      // Connection was intentionally closed or already handled
      return;
    }

    // Unexpected close - attempt reconnection
    logger.warn('Unexpected IMAP connection close - attempting reconnect');
    this.handleConnectionError(new Error('Connection closed unexpectedly'));
  }

  /**
   * Get connection status
   */
  isMonitoring(): boolean {
    return this.isConnected;
  }
}

export const eTransferEmailParser = new ETransferEmailParserService();
