import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { emailQueue, scheduleEmailJob } from '../queues/email.queue.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { ElasticsearchService } from '../services/elasticsearch.service.js';

const attachmentSchema = z.object({
  filename: z.string(),
  content: z.string(), // base64 encoded string
  contentType: z.string().optional(),
});

const scheduleSchema = z.object({
  senderId: z.string().uuid(),
  recipients: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  body: z.string(),
  scheduledAt: z.string().datetime().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

export const getScheduledEmails = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const emails = await prisma.email.findMany({
    where: {
      userId: req.user.id,
      status: 'scheduled',
    },
    include: {
      sender: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      scheduledAt: 'asc',
    },
  });

  res.status(200).json({
    success: true,
    count: emails.length,
    emails,
  });
};

export const getSentEmails = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const emails = await prisma.email.findMany({
    where: {
      userId: req.user.id,
      status: 'sent',
    },
    include: {
      sender: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      sentAt: 'desc',
    },
  });

  res.status(200).json({
    success: true,
    count: emails.length,
    emails,
  });
};

export const getEmailById = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const { id } = req.params;

  const email = await prisma.email.findFirst({
    where: {
      id,
      userId: req.user.id,
    },
    include: {
      sender: true,
    },
  });

  if (!email) {
    return res.status(404).json({
      success: false,
      error: { message: 'Email not found', statusCode: 404 },
    });
  }

  res.status(200).json({
    success: true,
    email,
  });
};

export const scheduleEmails = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const validation = scheduleSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid request body',
        details: validation.error.format(),
        statusCode: 400,
      },
    });
  }

  const { senderId, recipients, subject, body, scheduledAt, attachments } = validation.data;

  // Validate sender ownership
  const sender = await prisma.sender.findFirst({
    where: {
      id: senderId,
      userId: req.user.id,
      enabled: true,
    },
  });

  if (!sender) {
    return res.status(404).json({
      success: false,
      error: { message: 'Sender not found or disabled', statusCode: 404 },
    });
  }

  // Schedule batch using SchedulerService which enforces minimum delay & BullMQ jobs
  const batchResult = await SchedulerService.scheduleBatch({
    userId: req.user.id,
    senderId,
    recipients,
    subject,
    body,
    startAt: scheduledAt,
    attachments,
  });

  // Sync scheduled emails to Elasticsearch
  for (const item of batchResult.emails) {
    ElasticsearchService.indexEmail({
      id: item.id,
      userId: req.user.id,
      senderId,
      recipient: item.recipient,
      subject,
      body,
      status: 'scheduled',
      scheduledAt: item.scheduledAt,
      sentAt: null,
      createdAt: new Date().toISOString(),
    }).catch(() => {});
  }

  res.status(201).json({
    success: true,
    count: batchResult.scheduledCount,
    scheduled: batchResult.emails,
  });
};

export const cancelEmail = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const { id } = req.params;

  const email = await prisma.email.findFirst({
    where: {
      id,
      userId: req.user.id,
      status: 'scheduled',
    },
  });

  if (!email) {
    return res.status(404).json({
      success: false,
      error: { message: 'Scheduled email not found or already processed', statusCode: 404 },
    });
  }

  // Remove BullMQ job if present
  if (email.jobId) {
    try {
      const job = await emailQueue.getJob(email.jobId);
      if (job) {
        await job.remove();
      }
    } catch (err: any) {
      console.warn(`Could not remove job ${email.jobId} from BullMQ:`, err.message);
    }
  }

  // Update status to cancelled
  const updated = await prisma.email.update({
    where: { id: email.id },
    data: {
      status: 'cancelled',
      errorMessage: 'Cancelled by user',
    },
  });

  // Sync to search index
  ElasticsearchService.indexEmail({
    id: updated.id,
    userId: updated.userId,
    senderId: updated.senderId,
    recipient: updated.recipient,
    subject: updated.subject,
    body: updated.body,
    status: updated.status,
    scheduledAt: updated.scheduledAt.toISOString(),
    sentAt: null,
    createdAt: updated.createdAt.toISOString(),
  }).catch(() => {});

  res.status(200).json({
    success: true,
    message: 'Scheduled email cancelled successfully',
    email: updated,
  });
};

export const searchEmails = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const query = (req.query.q as string) || '';
  const status = req.query.status as string | undefined;

  const result = await ElasticsearchService.searchEmails(req.user.id, query, status);

  res.status(200).json({
    success: true,
    count: result.emails.length,
    source: result.source,
    emails: result.emails,
  });
};

export const getSenders = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const senders = await prisma.sender.findMany({
    where: {
      userId: req.user.id,
      enabled: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  res.status(200).json({
    success: true,
    senders,
  });
};

export const createSender = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const senderSchema = z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
  });

  const parsed = senderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { message: 'Invalid sender data', details: parsed.error.format(), statusCode: 400 },
    });
  }

  const sender = await prisma.sender.upsert({
    where: {
      userId_email: {
        userId: req.user.id,
        email: parsed.data.email,
      },
    },
    create: {
      userId: req.user.id,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      enabled: true,
    },
    update: {
      displayName: parsed.data.displayName,
      enabled: true,
    },
  });

  res.status(201).json({
    success: true,
    sender,
  });
};

export const getStats = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const [scheduledCount, sentCount, failedCount, totalSenders] = await Promise.all([
    prisma.email.count({ where: { userId: req.user.id, status: 'scheduled' } }),
    prisma.email.count({ where: { userId: req.user.id, status: 'sent' } }),
    prisma.email.count({ where: { userId: req.user.id, status: 'failed' } }),
    prisma.sender.count({ where: { userId: req.user.id, enabled: true } }),
  ]);

  res.status(200).json({
    success: true,
    stats: {
      scheduledCount,
      sentCount,
      failedCount,
      totalSenders,
    },
  });
};
