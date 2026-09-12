import { Worker, Job } from 'bullmq';
import { env } from '../config/env.js';
import { redisClient } from '../config/redis.js';
import { EMAIL_QUEUE_NAME, EmailJobData, scheduleEmailJob } from '../queues/email.queue.js';
import { prisma } from '../config/prisma.js';
import { EmailService } from '../email/email.service.js';
import { RateLimiterService } from '../services/rateLimiter.service.js';
import { SlackService } from '../slack/slack.service.js';
import { ElasticsearchService } from '../services/elasticsearch.service.js';

export type JobProcessor = (job: Job<EmailJobData>) => Promise<any>;

let customProcessor: JobProcessor | null = null;

export const setJobProcessor = (processor: JobProcessor | null) => {
  customProcessor = processor;
};

export const defaultProcessor: JobProcessor = async (job: Job<EmailJobData>) => {
  const { emailId, recipient, subject, body } = job.data;
  console.log(`📨 [Worker] Processing email job ${job.id} for email ${emailId} to ${recipient} (Subject: "${subject}")`);

  // 1. Fetch email and sender from DB
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true },
  });

  if (!email) {
    console.warn(`⚠️ [Worker] Email record ${emailId} not found in database. Skipping job.`);
    return { skipped: true, reason: 'Email not found' };
  }

  // Pre-send check: if already sent or cancelled, never resend
  if (email.status === 'sent') {
    console.log(`ℹ️ [Worker] Email ${emailId} is already marked sent. Skipping redundant send.`);
    return { skipped: true, reason: 'Already sent' };
  }

  if (email.status === 'cancelled') {
    console.log(`ℹ️ [Worker] Email ${emailId} was cancelled by user. Skipping.`);
    return { skipped: true, reason: 'Cancelled' };
  }

  // 2. ATOMIC CLAIM: Only one worker can transition from 'scheduled' to 'processing'.
  // If another worker or thread already claimed it, count is 0 and we immediately skip.
  const claimResult = await prisma.email.updateMany({
    where: {
      id: emailId,
      status: 'scheduled',
    },
    data: {
      status: 'processing',
      jobId: job.id ? String(job.id) : null,
    },
  });

  if (claimResult.count === 0) {
    console.warn(`🛡️ [Idempotency] Worker ${job.id} could not claim email ${emailId}. Already claimed or sent. Skipping!`);
    return { skipped: true, reason: 'Already processing or sent (atomic claim failed)' };
  }

  try {
    // 3. Distributed Redis Hourly Rate Limit Check
    const rateCheck = await RateLimiterService.checkAndIncrement(email.senderId);
    if (!rateCheck.allowed) {
      console.warn(
        `⏳ [RateLimit] Sender "${email.sender.displayName}" reached hourly limit (${rateCheck.limit}/hr). Rescheduling email ${emailId} to next window at ${rateCheck.rescheduleTimestamp?.toISOString()}`,
      );

      // Trigger real Slack notification (idempotent across hour window)
      SlackService.notifyRateLimitHit(
        email.userId,
        email.sender.email,
        rateCheck.limit,
      ).catch((err) => {
        console.warn('Slack alert notice:', err.message);
      });

      // Revert status to scheduled with new timestamp
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'scheduled',
          scheduledAt: rateCheck.rescheduleTimestamp!,
        },
      });

      // Re-queue delayed job into BullMQ for the next hour window
      const newJobId = `email-job-${emailId}-resched-${Date.now()}`;
      await scheduleEmailJob(
        {
          emailId: email.id,
          userId: email.userId,
          senderId: email.senderId,
          recipient,
          subject,
          body,
          scheduledAt: rateCheck.rescheduleTimestamp!.toISOString(),
          idempotencyKey: email.idempotencyKey,
        },
        rateCheck.delayToNextWindowMs!,
        newJobId,
      );

      return {
        rescheduled: true,
        emailId,
        rescheduledTo: rateCheck.rescheduleTimestamp,
      };
    }

    // 4. Perform real SMTP transmission via Nodemailer + Ethereal
    const sendResult = await EmailService.sendEmail({
      sender: email.sender,
      recipient,
      subject,
      body: body || email.body,
      attachments: job.data.attachments,
    });

    // 4. On SMTP success: transition to sent
    const updatedEmail = await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        errorMessage: null,
        previewUrl: sendResult.previewUrl || null,
      },
    });

    // Sync to search index
    ElasticsearchService.indexEmail({
      id: updatedEmail.id,
      userId: updatedEmail.userId,
      senderId: updatedEmail.senderId,
      recipient: updatedEmail.recipient,
      subject: updatedEmail.subject,
      body: updatedEmail.body,
      status: updatedEmail.status,
      scheduledAt: updatedEmail.scheduledAt.toISOString(),
      sentAt: updatedEmail.sentAt?.toISOString() || null,
      createdAt: updatedEmail.createdAt.toISOString(),
    }).catch(() => {});

    return {
      processed: true,
      emailId,
      status: updatedEmail.status,
      messageId: sendResult.messageId,
      previewUrl: sendResult.previewUrl,
    };
  } catch (error: any) {
    // 5. On SMTP failure: transition to failed
    const errorMsg = EmailService.normalizeError(error);
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: errorMsg,
      },
    });

    // Re-throw so BullMQ triggers exponential backoff retry policy
    throw new Error(errorMsg);
  }
};

export const createEmailWorker = () => {
  console.log(`⚙️ Initializing BullMQ Email Worker with concurrency: ${env.WORKER_CONCURRENCY}`);

  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      if (customProcessor) {
        return customProcessor(job);
      }
      return defaultProcessor(job);
    },
    {
      connection: {
        host: redisClient.options.host || '127.0.0.1',
        port: redisClient.options.port || 6379,
        maxRetriesPerRequest: null,
      },
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on('ready', () => {
    console.log(`✅ [Worker] Email worker is ready and listening for jobs (Concurrency: ${env.WORKER_CONCURRENCY})`);
  });

  worker.on('active', (job) => {
    console.log(`⚡ [Worker] Job active: ${job.id}`);
  });

  worker.on('completed', (job, result) => {
    console.log(`✅ [Worker] Job ${job.id} completed successfully:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [Worker] Job ${job?.id} failed on attempt ${job?.attemptsMade}:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ [Worker] Worker error:', err);
  });

  return worker;
};

let emailWorkerInstance: Worker<EmailJobData> | null = null;

export const startEmailWorker = () => {
  if (!emailWorkerInstance) {
    emailWorkerInstance = createEmailWorker();
  }
  return emailWorkerInstance;
};

export const closeEmailWorker = async () => {
  if (emailWorkerInstance) {
    console.log('🛑 Closing BullMQ Email Worker...');
    await emailWorkerInstance.close();
    emailWorkerInstance = null;
    console.log('🔒 BullMQ Email Worker closed successfully.');
  }
};
