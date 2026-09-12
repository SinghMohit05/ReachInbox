import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed/clean...');

  // Clean existing records to allow a fresh state without hardcoded mock users
  await prisma.email.deleteMany({});
  await prisma.slackConnection.deleteMany({});
  await prisma.sender.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('✅ Clean database ready for real user authentication.');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
