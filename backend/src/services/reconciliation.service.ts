import { prisma } from '../config/prisma.js';
import { emailQueue, scheduleEmailJob } from '../queues/email.queue.js';
import { EmailStatus } from '@prisma/client';

export interface ReconciliationReport {
  checked: number;
  recovered: number;
  alreadyQueued: number;
  zombiesReset: number;
}

export class ReconciliationService {
  /**
   * Scans PostgreSQL for all pending scheduled emails and zombie processing states,
   * reconciling them against BullMQ delayed jobs to ensure zero missed emails across restarts.
   */
  public static async reconcileScheduledEmails(): Promise<ReconciliationReport> {
    console.log('🔄 [Reconciliation] Initiating startup queue reconciliation...');

    let recovered = 0;
    let alreadyQueued = 0;
    let zombiesReset = 0;

    // 1. Reset zombie processing emails (emails left in 'processing' without an active job)
    const processingEmails = await prisma.email.findMany({
      where: { status: EmailStatus.processing },
    });

    for (const email of processingEmails) {
      const jobId = email.jobId || `email-job-${email.id}`;
      const job = await emailQueue.getJob(jobId);
      const isActive = job ? await job.isActive() : false;

      if (!isActive) {
        console.warn(`🧟 [Reconciliation] Detected zombie processing email ${email.id}. Reverting to scheduled.`);
        await prisma.email.update({
          where: { id: email.id },
          data: { status: EmailStatus.scheduled },
        });
        zombiesReset++;
      }
    }

    // 2. Fetch all scheduled emails
    const scheduledEmails = await prisma.email.findMany({
      where: { status: EmailStatus.scheduled },
    });

    const checked = scheduledEmails.length;

    for (const email of scheduledEmails) {
      const deterministicJobId = `email-job-${email.id}`;
      const existingJob = await emailQueue.getJob(deterministicJobId);

      if (existingJob) {
        const state = await existingJob.getState();
        // If job is already active, delayed, or waiting, it is safe
        if (state === 'delayed' || state === 'waiting' || state === 'active') {
          alreadyQueued++;
          continue;
        }
      }

      // If job does not exist in Redis, recover it
      const targetTime = email.scheduledAt.getTime();
      const delayMs = Math.max(0, targetTime - Date.now());

      await scheduleEmailJob(
        {
          emailId: email.id,
          userId: email.userId,
          senderId: email.senderId,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          scheduledAt: email.scheduledAt.toISOString(),
          idempotencyKey: email.idempotencyKey,
        },
        delayMs,
        deterministicJobId,
      );

      await prisma.email.update({
        where: { id: email.id },
        data: { jobId: deterministicJobId },
      });

      console.log(`♻️ [Reconciliation] Recovered delayed job for email ${email.id} (Delay: ${delayMs}ms)`);
      recovered++;
    }

    const report: ReconciliationReport = {
      checked,
      recovered,
      alreadyQueued,
      zombiesReset,
    };

    console.log('✅ [Reconciliation] Completed queue reconciliation:', report);
    return report;
  }
}
