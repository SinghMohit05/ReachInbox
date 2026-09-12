import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { scheduleEmailJob, emailQueue, EmailAttachment } from '../queues/email.queue.js';
import { Email, EmailStatus } from '@prisma/client';

export interface ScheduleBatchInput {
  userId: string;
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  startAt?: string | Date;
  delayBetweenEmailsSeconds?: number;
  hourlyLimit?: number;
  idempotencyKeyPrefix?: string;
  attachments?: EmailAttachment[];
}

export interface ScheduledEmailPlan {
  recipient: string;
  scheduledAt: Date;
  delayMs: number;
  idempotencyKey: string;
}

export interface ScheduleBatchResult {
  scheduledCount: number;
  effectiveDelayMs: number;
  firstScheduledAt: string;
  lastScheduledAt: string;
  emails: Array<{
    id: string;
    recipient: string;
    scheduledAt: string;
    jobId: string;
  }>;
}

export class SchedulerService {
  /**
   * Calculates the exact execution timestamps for a batch of emails respecting:
   * 1. Requested start time (or now if in the past)
   * 2. Configurable minimum delay (MIN_EMAIL_DELAY_MS)
   * 3. User-specified delay
   */
  public static calculateBatchSchedule(
    recipients: string[],
    startAt?: string | Date,
    delaySeconds?: number,
    idempotencyKeyPrefix?: string,
  ): ScheduledEmailPlan[] {
    const now = Date.now();
    const requestedStartTime = startAt ? new Date(startAt).getTime() : now;
    const baseStartTime = Math.max(now, requestedStartTime);

    // Calculate effective delay in milliseconds: max of system minimum and user input
    const userDelayMs = typeof delaySeconds === 'number' && delaySeconds >= 0 ? delaySeconds * 1000 : 0;
    const effectiveDelayMs = Math.max(env.MIN_EMAIL_DELAY_MS, userDelayMs);

    const prefix = idempotencyKeyPrefix || `batch-${Date.now()}`;

    return recipients.map((recipient, index) => {
      const scheduledTimestamp = baseStartTime + index * effectiveDelayMs;
      const scheduledAt = new Date(scheduledTimestamp);
      const delayMs = Math.max(0, scheduledTimestamp - Date.now());
      const idempotencyKey = `${prefix}-${index}-${recipient.toLowerCase().trim()}`;

      return {
        recipient: recipient.trim(),
        scheduledAt,
        delayMs,
        idempotencyKey,
      };
    });
  }

  /**
   * Schedules a batch of emails atomically in PostgreSQL and queues corresponding
   * BullMQ delayed jobs in Redis.
   */
  public static async scheduleBatch(input: ScheduleBatchInput): Promise<ScheduleBatchResult> {
    const {
      userId,
      senderId,
      recipients,
      subject,
      body,
      startAt,
      delayBetweenEmailsSeconds,
      idempotencyKeyPrefix,
    } = input;

    if (!recipients || recipients.length === 0) {
      throw new Error('At least one recipient is required for scheduling.');
    }

    // Verify sender exists and belongs to user
    const sender = await prisma.sender.findFirst({
      where: { id: senderId, userId, enabled: true },
    });
    if (!sender) {
      throw new Error(`Sender profile ${senderId} not found or not enabled.`);
    }

    // 1. Calculate schedule plans
    const plans = this.calculateBatchSchedule(
      recipients,
      startAt,
      delayBetweenEmailsSeconds,
      idempotencyKeyPrefix,
    );

    const userDelayMs = typeof delayBetweenEmailsSeconds === 'number' ? delayBetweenEmailsSeconds * 1000 : 0;
    const effectiveDelayMs = Math.max(env.MIN_EMAIL_DELAY_MS, userDelayMs);

    // 2. Insert records in database transaction
    const createdEmails = await prisma.$transaction(async (tx) => {
      const records: Email[] = [];
      for (const plan of plans) {
        const emailRecord = await tx.email.create({
          data: {
            userId,
            senderId,
            recipient: plan.recipient,
            subject,
            body,
            status: EmailStatus.scheduled,
            scheduledAt: plan.scheduledAt,
            idempotencyKey: plan.idempotencyKey,
          },
        });
        records.push(emailRecord);
      }
      return records;
    });

    // 3. Queue durable BullMQ delayed jobs into Redis for each email
    const queuedDetails: Array<{ id: string; recipient: string; scheduledAt: string; jobId: string }> = [];

    for (let i = 0; i < createdEmails.length; i++) {
      const email = createdEmails[i];
      const plan = plans[i];
      const jobId = `email-job-${email.id}`;

      await scheduleEmailJob(
        {
          emailId: email.id,
          userId,
          senderId,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          scheduledAt: email.scheduledAt.toISOString(),
          idempotencyKey: email.idempotencyKey,
          attachments: input.attachments,
        },
        plan.delayMs,
        jobId,
      );

      // Attach jobId to email record
      await prisma.email.update({
        where: { id: email.id },
        data: { jobId },
      });

      queuedDetails.push({
        id: email.id,
        recipient: email.recipient,
        scheduledAt: email.scheduledAt.toISOString(),
        jobId,
      });
    }

    console.log(`📅 [SchedulerService] Successfully scheduled ${createdEmails.length} emails with ${effectiveDelayMs}ms delay between sends.`);

    return {
      scheduledCount: createdEmails.length,
      effectiveDelayMs,
      firstScheduledAt: plans[0].scheduledAt.toISOString(),
      lastScheduledAt: plans[plans.length - 1].scheduledAt.toISOString(),
      emails: queuedDetails,
    };
  }
}
