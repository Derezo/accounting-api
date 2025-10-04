import Queue from 'bull';
import { logger } from '../utils/logger';
import { emailService } from './email.service';
import { emailTemplateService, EmailTemplateData } from './email-template.service';
import { auditService } from './audit.service';

/**
 * Email queue job data
 */
export interface EmailQueueJob {
  to: string | string[];
  subject?: string;
  template?: string;
  templateData?: Partial<EmailTemplateData>;
  html?: string;
  text?: string;
  attachments?: any[];
  organizationId?: string;
  userId?: string;
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Email queue result
 */
export interface EmailQueueResult {
  messageId?: string;
  status: 'sent' | 'failed';
  error?: string;
}

/**
 * Email Queue Service
 * Handles async email processing with Bull queue
 */
class EmailQueueService {
  private emailQueue: Queue.Queue<EmailQueueJob>;
  private isInitialized: boolean = false;

  constructor() {
    // Initialize queue with Redis connection
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    this.emailQueue = new Queue<EmailQueueJob>('email-notifications', redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000 // Start with 5 second delay
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500 // Keep last 500 failed jobs for debugging
      }
    });

    this.setupProcessors();
    this.setupEventHandlers();
  }

  /**
   * Initialize the queue service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test Redis connection
      await this.emailQueue.isReady();

      // Initialize email template service
      await emailTemplateService.initialize();

      this.isInitialized = true;
      logger.info('Email queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email queue service', error);
      throw new Error('Email queue service initialization failed');
    }
  }

  /**
   * Setup queue processors
   */
  private setupProcessors(): void {
    // Process email jobs
    this.emailQueue.process(async (job) => {
      const { data } = job;

      logger.info('Processing email job', {
        jobId: job.id,
        to: data.to,
        template: data.template,
        subject: data.subject
      });

      try {
        let html = data.html;
        let text = data.text;
        let subject = data.subject;

        // If template is provided, render it
        if (data.template && data.templateData) {
          const rendered = await emailTemplateService.render(data.template, data.templateData);
          html = rendered.html;
          text = rendered.text;
          subject = subject || rendered.subject;
        }

        if (!subject) {
          throw new Error('Email subject is required');
        }

        // Send email
        await emailService.sendEmail(
          data.to,
          subject,
          html || '',
          text,
          data.attachments
        );

        // Audit log if organizationId provided
        if (data.organizationId) {
          await auditService.logAction({
            action: 'EMAIL_SENT',
            entityType: 'Email',
            entityId: job.id?.toString() || 'unknown',
            changes: {
              to: { after: Array.isArray(data.to) ? data.to : [data.to] },
              subject: { after: subject },
              template: { after: data.template },
              jobId: { after: job.id }
            },
            context: {
              organizationId: data.organizationId,
              userId: data.userId || 'system',
              ipAddress: 'system',
              userAgent: 'email-queue-service'
            }
          });
        }

        logger.info('Email sent successfully', {
          jobId: job.id,
          to: data.to
        });

        return {
          status: 'sent',
          messageId: `job-${job.id}`
        } as EmailQueueResult;
      } catch (error) {
        logger.error('Email job failed', {
          jobId: job.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          data
        });

        throw error; // Re-throw to trigger retry mechanism
      }
    });
  }

  /**
   * Setup event handlers for queue monitoring
   */
  private setupEventHandlers(): void {
    this.emailQueue.on('completed', (job, result: EmailQueueResult) => {
      logger.info('Email job completed', {
        jobId: job.id,
        status: result.status,
        to: job.data.to
      });
    });

    this.emailQueue.on('failed', (job, err) => {
      logger.error('Email job failed permanently', {
        jobId: job?.id,
        attempts: job?.attemptsMade,
        error: err.message,
        data: job?.data
      });
    });

    this.emailQueue.on('stalled', (job) => {
      logger.warn('Email job stalled', {
        jobId: job.id,
        data: job.data
      });
    });

    this.emailQueue.on('error', (error) => {
      logger.error('Email queue error', { error: error.message });
    });
  }

  /**
   * Add email to queue
   */
  async queueEmail(job: EmailQueueJob): Promise<Queue.Job<EmailQueueJob>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const priority = this.getPriorityValue(job.priority);

    const queuedJob = await this.emailQueue.add(job, {
      priority,
      jobId: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });

    logger.info('Email queued', {
      jobId: queuedJob.id,
      to: job.to,
      template: job.template,
      priority: job.priority
    });

    return queuedJob;
  }

  /**
   * Send email immediately (synchronous)
   * Bypasses queue for urgent emails
   */
  async sendEmailNow(job: EmailQueueJob): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    let html = job.html;
    let text = job.text;
    let subject = job.subject;

    // If template is provided, render it
    if (job.template && job.templateData) {
      const rendered = await emailTemplateService.render(job.template, job.templateData);
      html = rendered.html;
      text = rendered.text;
      subject = subject || rendered.subject;
    }

    if (!subject) {
      throw new Error('Email subject is required');
    }

    // Send email directly
    await emailService.sendEmail(
      job.to,
      subject,
      html || '',
      text,
      job.attachments
    );

    // Audit log if organizationId provided
    if (job.organizationId) {
      await auditService.logAction({
        action: 'EMAIL_SENT',
        entityType: 'Email',
        entityId: `immediate-${Date.now()}`,
        changes: {
          to: { after: Array.isArray(job.to) ? job.to : [job.to] },
          subject: { after: subject },
          template: { after: job.template },
          immediate: { after: true }
        },
        context: {
          organizationId: job.organizationId,
          userId: job.userId || 'system',
          ipAddress: 'system',
          userAgent: 'email-queue-service'
        }
      });
    }

    logger.info('Email sent immediately', {
      to: job.to,
      subject
    });
  }

  /**
   * Get numeric priority value
   */
  private getPriorityValue(priority?: 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'high':
        return 1;
      case 'low':
        return 10;
      default:
        return 5;
    }
  }

  /**
   * Get queue status and metrics
   */
  async getQueueMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.emailQueue.getWaitingCount(),
      this.emailQueue.getActiveCount(),
      this.emailQueue.getCompletedCount(),
      this.emailQueue.getFailedCount(),
      this.emailQueue.getDelayedCount()
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Get failed jobs for debugging
   */
  async getFailedJobs(limit: number = 50): Promise<Queue.Job<EmailQueueJob>[]> {
    return this.emailQueue.getFailed(0, limit);
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(jobId: string): Promise<void> {
    const job = await this.emailQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.retry();
    logger.info('Email job retry scheduled', { jobId });
  }

  /**
   * Clear completed jobs older than specified time
   */
  async cleanOldJobs(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    await this.emailQueue.clean(olderThanMs, 'completed');
    logger.info('Old completed email jobs cleaned', { olderThanMs });
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.emailQueue.pause();
    logger.info('Email queue paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.emailQueue.resume();
    logger.info('Email queue resumed');
  }

  /**
   * Shutdown queue gracefully
   */
  async shutdown(): Promise<void> {
    await this.emailQueue.close();
    logger.info('Email queue shut down');
  }
}

export const emailQueueService = new EmailQueueService();
