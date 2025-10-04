/**
 * SMS Reminder Scheduler Service
 * Automatically schedules and sends SMS reminders for appointments
 */

import Bull from 'bull';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { smsService } from './sms.service';

interface ReminderJob {
  appointmentId: string;
  reminderType: '24H' | '1H';
}

class SmsReminderSchedulerService {
  private queue: Bull.Queue<ReminderJob>;
  private readonly enabled24h: boolean;
  private readonly enabled1h: boolean;

  constructor() {
    this.enabled24h = process.env.SMS_REMINDER_24H_ENABLED === 'true';
    this.enabled1h = process.env.SMS_REMINDER_1H_ENABLED === 'true';

    // Initialize Bull queue
    this.queue = new Bull<ReminderJob>('sms-reminders', {
      redis: {
        host: process.env.REDIS_URL?.split(':')[0] || 'localhost',
        port: parseInt(process.env.REDIS_URL?.split(':')[1] || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });

    // Setup queue processing
    this.setupQueueProcessing();
  }

  /**
   * Setup queue processing handlers
   */
  private setupQueueProcessing(): void {
    this.queue.process(async (job) => {
      const { appointmentId, reminderType } = job.data;

      try {
        // Check if appointment still exists and is valid
        const appointment = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          include: {
            customer: {
              include: {
                person: true,
                business: true,
              },
            },
          },
        });

        if (!appointment) {
          logger.warn('Appointment not found for SMS reminder', { appointmentId });
          return;
        }

        // Don't send if appointment is cancelled or completed
        if (appointment.cancelled || appointment.completed) {
          logger.info('Skipping SMS reminder - appointment status changed', {
            appointmentId,
            cancelled: appointment.cancelled,
            completed: appointment.completed,
          });
          return;
        }

        // Check if customer has phone number
        const phoneNumber =
          appointment.customer.person?.phone ||
          appointment.customer.business?.phone;

        if (!phoneNumber) {
          logger.warn('No phone number for customer - skipping SMS', {
            appointmentId,
            customerId: appointment.customerId,
          });
          return;
        }

        // Send appropriate reminder
        if (reminderType === '24H') {
          await smsService.sendAppointmentReminder24h(appointmentId);
          logger.info('Sent 24h SMS reminder', { appointmentId });
        } else if (reminderType === '1H') {
          await smsService.sendAppointmentReminder1h(appointmentId);
          logger.info('Sent 1h SMS reminder', { appointmentId });
        }
      } catch (error) {
        logger.error('Failed to process SMS reminder job', {
          error,
          appointmentId,
          reminderType,
        });
        throw error; // Re-throw to trigger Bull retry
      }
    });

    // Error handling
    this.queue.on('failed', (job, error) => {
      logger.error('SMS reminder job failed', {
        jobId: job.id,
        appointmentId: job.data.appointmentId,
        reminderType: job.data.reminderType,
        error,
      });
    });

    this.queue.on('completed', (job) => {
      logger.info('SMS reminder job completed', {
        jobId: job.id,
        appointmentId: job.data.appointmentId,
        reminderType: job.data.reminderType,
      });
    });

    logger.info('SMS reminder queue processing initialized');
  }

  /**
   * Schedule reminders for a new appointment
   */
  async scheduleReminders(appointmentId: string): Promise<void> {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const appointmentTime = new Date(appointment.startTime);
      const now = new Date();

      // Schedule 24-hour reminder
      if (this.enabled24h) {
        const reminder24h = new Date(appointmentTime.getTime() - 24 * 60 * 60 * 1000);
        if (reminder24h > now) {
          await this.queue.add(
            {
              appointmentId,
              reminderType: '24H',
            },
            {
              delay: reminder24h.getTime() - now.getTime(),
              jobId: `${appointmentId}-24h`,
              removeOnComplete: true,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            }
          );

          logger.info('Scheduled 24h SMS reminder', {
            appointmentId,
            scheduledFor: reminder24h.toISOString(),
          });
        }
      }

      // Schedule 1-hour reminder
      if (this.enabled1h) {
        const reminder1h = new Date(appointmentTime.getTime() - 60 * 60 * 1000);
        if (reminder1h > now) {
          await this.queue.add(
            {
              appointmentId,
              reminderType: '1H',
            },
            {
              delay: reminder1h.getTime() - now.getTime(),
              jobId: `${appointmentId}-1h`,
              removeOnComplete: true,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            }
          );

          logger.info('Scheduled 1h SMS reminder', {
            appointmentId,
            scheduledFor: reminder1h.toISOString(),
          });
        }
      }
    } catch (error) {
      logger.error('Failed to schedule SMS reminders', {
        error,
        appointmentId,
      });
      throw error;
    }
  }

  /**
   * Cancel scheduled reminders for an appointment
   */
  async cancelReminders(appointmentId: string): Promise<void> {
    try {
      // Remove 24h reminder job
      const job24h = await this.queue.getJob(`${appointmentId}-24h`);
      if (job24h) {
        await job24h.remove();
        logger.info('Cancelled 24h SMS reminder', { appointmentId });
      }

      // Remove 1h reminder job
      const job1h = await this.queue.getJob(`${appointmentId}-1h`);
      if (job1h) {
        await job1h.remove();
        logger.info('Cancelled 1h SMS reminder', { appointmentId });
      }
    } catch (error) {
      logger.error('Failed to cancel SMS reminders', {
        error,
        appointmentId,
      });
    }
  }

  /**
   * Reschedule reminders when appointment time changes
   */
  async rescheduleReminders(appointmentId: string): Promise<void> {
    try {
      // Cancel existing reminders
      await this.cancelReminders(appointmentId);

      // Schedule new reminders
      await this.scheduleReminders(appointmentId);

      logger.info('Rescheduled SMS reminders', { appointmentId });
    } catch (error) {
      logger.error('Failed to reschedule SMS reminders', {
        error,
        appointmentId,
      });
      throw error;
    }
  }

  /**
   * Process upcoming appointments and schedule reminders (run hourly via cron)
   */
  async processUpcomingAppointments(): Promise<void> {
    try {
      const now = new Date();
      const lookAheadTime = new Date(now.getTime() + 48 * 60 * 60 * 1000); // Next 48 hours

      // Find appointments that need reminders scheduled
      const appointments = await prisma.appointment.findMany({
        where: {
          startTime: {
            gte: now,
            lte: lookAheadTime,
          },
          cancelled: false,
          completed: false,
        },
      });

      logger.info('Processing upcoming appointments for SMS reminders', {
        count: appointments.length,
      });

      for (const appointment of appointments) {
        // Check if reminders already scheduled
        const existing24h = await this.queue.getJob(`${appointment.id}-24h`);
        const existing1h = await this.queue.getJob(`${appointment.id}-1h`);

        if (!existing24h && !existing1h) {
          await this.scheduleReminders(appointment.id);
        }
      }

      logger.info('Completed processing upcoming appointments');
    } catch (error) {
      logger.error('Failed to process upcoming appointments', { error });
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }
}

export const smsReminderScheduler = new SmsReminderSchedulerService();
