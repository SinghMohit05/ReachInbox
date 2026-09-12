import { Queue, QueueOptions, JobsOptions } from 'bullmq';
import { env } from '../config/env.js';
import { redisClient } from '../config/redis.js';

export interface EmailAttachment {
  filename: string;
  content: string; // base64 encoded
  contentType?: string;
}

export interface EmailJobData {
  emailId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  idempotencyKey: string;
  attachments?: EmailAttachment[];
}

export const EMAIL_QUEUE_NAME = 'email-queue';

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    count: 1000,
  },
  removeOnFail: {
    count: 5000,
  },
};

const queueOptions: QueueOptions = {
  connection: {
    host: redisClient.options.host || '127.0.0.1',
    port: redisClient.options.port || 6379,
    maxRetriesPerRequest: null,
  },
  defaultJobOptions,
};

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, queueOptions);

emailQueue.on('error', (err) => {
  console.error('❌ BullMQ Queue Error:', err);
});

/**
 * Adds a scheduled email job with persistent delay and deterministic job identity
 */
export const scheduleEmailJob = async (
  data: EmailJobData,
  delayMs: number,
  customJobId?: string,
) => {
  const jobId = customJobId || `email-job-${data.emailId}`;

  const job = await emailQueue.add(
    'send-email',
    data,
    {
      jobId,
      delay: Math.max(0, delayMs),
    },
  );

  return job;
};
