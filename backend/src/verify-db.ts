import { prisma } from './config/prisma.js';

async function verifyDatabase() {
  console.log('🔍 Verifying Database Implementation (Self-Contained)...');

  // 1. Create an ephemeral test user with sender and email
  const user = await prisma.user.create({
    data: {
      name: 'DB Test Runner',
      email: `db-test-${Date.now()}@domain.io`,
      senders: {
        create: {
          email: `sender-${Date.now()}@domain.io`,
          displayName: 'Test Sender',
          enabled: true,
        },
      },
    },
    include: {
      senders: true,
    },
  });

  console.log(`✅ Created Ephemeral User: ${user.name} with ${user.senders.length} sender(s).`);

  try {
    const sender = user.senders[0];

    // 2. Test database-level unique constraint on idempotencyKey
    console.log('🛡️ Testing database-level idempotency key unique constraint...');
    const testKey = `test-idempotency-${Date.now()}`;

    // Insert first email
    const email1 = await prisma.email.create({
      data: {
        userId: user.id,
        senderId: sender.id,
        recipient: 'duplicate-test@example.com',
        subject: 'Idempotency Test 1',
        body: 'First attempt',
        status: 'scheduled',
        scheduledAt: new Date(),
        idempotencyKey: testKey,
      },
    });
    console.log(`  -> Successfully created first record with idempotencyKey: ${testKey}`);

    // Attempt duplicate insert with SAME idempotencyKey
    let duplicateCaught = false;
    try {
      await prisma.email.create({
        data: {
          userId: user.id,
          senderId: sender.id,
          recipient: 'duplicate-test@example.com',
          subject: 'Idempotency Test 2 (Should Fail)',
          body: 'Second attempt with identical idempotencyKey',
          status: 'scheduled',
          scheduledAt: new Date(),
          idempotencyKey: testKey, // Same key!
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002' || err.message.includes('Unique constraint failed')) {
        duplicateCaught = true;
        console.log(`  -> Expected Unique Constraint Violation caught: code=${err.code}, target=${err.meta?.target}`);
      } else {
        throw err;
      }
    }

    if (!duplicateCaught) {
      throw new Error('CRITICAL FAILURE: Database allowed duplicate idempotencyKey insert!');
    }
    console.log('✅ DATABASE CONSTRAINT VERIFIED: Duplicate idempotency key was rejected by PostgreSQL unique constraint.');

    console.log('🎯 Database Verification PASSED 100%!');
  } finally {
    // Clean up test user and all cascaded data
    await prisma.user.delete({ where: { id: user.id } });
    console.log('🧹 Cleaned up test user and cascaded records.');
  }
}

verifyDatabase()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
