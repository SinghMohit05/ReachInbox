import { prisma } from './config/prisma.js';
import { emailQueue } from './queues/email.queue.js';
import { ReconciliationService } from './services/reconciliation.service.js';

async function main() {
  console.log('--- Verifying Phase 12: Startup Recovery & Reconciliation ---');

  const user = await prisma.user.create({
    data: {
      name: 'Reconcile Test Runner',
      email: `reconcile-test-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `reconcile-sender-${Date.now()}@domain.io`,
          displayName: 'Reconcile Sender',
          enabled: true,
        },
      },
    },
    include: { senders: true },
  });
  const sender = user.senders[0];

  // 1. Create a test scheduled email WITHOUT a Redis job (simulating crash before enqueue or Redis restart)
  const testEmail1 = await prisma.email.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      recipient: 'reconcile-test-1@domain.io',
      subject: 'Reconcile Test Missing Job',
      body: 'Testing startup recovery',
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 120000),
      idempotencyKey: `reconcile-test-1-${Date.now()}`,
    },
  });

  // 2. Create a test zombie processing email (simulating hard crash during worker processing)
  const testEmail2 = await prisma.email.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      recipient: 'reconcile-zombie@domain.io',
      subject: 'Zombie Processing Test',
      body: 'Testing zombie cleanup',
      status: 'processing',
      scheduledAt: new Date(Date.now() + 180000),
      idempotencyKey: `reconcile-zombie-${Date.now()}`,
    },
  });

  // Make sure neither job exists in Redis right now
  await (await emailQueue.getJob(`email-job-${testEmail1.id}`))?.remove();
  await (await emailQueue.getJob(`email-job-${testEmail2.id}`))?.remove();

  console.log('🧪 Created test records (1 missing job, 1 zombie processing email)');

  // 3. Run reconciliation pass 1
  const report1 = await ReconciliationService.reconcileScheduledEmails();
  console.log('✅ Pass 1 report:', report1);

  if (report1.recovered < 1) {
    throw new Error(`Expected at least 1 recovered job, got ${report1.recovered}`);
  }
  if (report1.zombiesReset < 1) {
    throw new Error(`Expected at least 1 zombie reset, got ${report1.zombiesReset}`);
  }

  // Verify jobs now exist in BullMQ
  const job1 = await emailQueue.getJob(`email-job-${testEmail1.id}`);
  const job2 = await emailQueue.getJob(`email-job-${testEmail2.id}`);
  if (!job1 || !job2) {
    throw new Error('Expected BullMQ jobs to exist after reconciliation');
  }

  console.log('✅ BullMQ jobs successfully verified in Redis');

  // 4. Run reconciliation pass 2 (Idempotency test: should NOT recover or duplicate anything)
  const report2 = await ReconciliationService.reconcileScheduledEmails();
  console.log('✅ Pass 2 report (Idempotency check):', report2);
  if (report2.recovered !== 0 || report2.zombiesReset !== 0) {
    throw new Error('Pass 2 should not recover or reset anything!');
  }

  // Cleanup test emails and user
  await job1.remove();
  await job2.remove();
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  console.log('🎉 Phase 12 Verified Successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Phase 12 verification failed:', err);
  process.exit(1);
});
