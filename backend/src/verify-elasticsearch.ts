import { prisma } from './config/prisma.js';
import { ElasticsearchService } from './services/elasticsearch.service.js';

async function main() {
  console.log('--- Verifying Phase 10: Elasticsearch Integration & Search ---');

  const user = await prisma.user.create({
    data: {
      name: 'ES Test Runner',
      email: `es-test-${Date.now()}@domain.io`,
    },
  });

  // 1. Health check
  const isHealthy = await ElasticsearchService.checkHealth();
  console.log(`📡 Elasticsearch healthy: ${isHealthy}`);

  // 2. Init index
  await ElasticsearchService.initIndex();

  // 3. Test bulk reindexing
  const reindexResult = await ElasticsearchService.reindexAll(user.id);
  console.log('✅ Reindex result:', reindexResult);

  // 4. Test search (should work via ES or gracefully via DB fallback)
  const searchResult = await ElasticsearchService.searchEmails(user.id, 'Project', 'scheduled');
  console.log(`✅ Search result: Found ${searchResult.emails.length} emails (Source: ${searchResult.source})`);

  // 5. Verify User Isolation
  const otherUserEmails = await ElasticsearchService.searchEmails('non-existent-user-id', 'Project');
  console.log(`✅ User isolation test: non-existent-user got ${otherUserEmails.emails.length} emails`);
  if (otherUserEmails.emails.length !== 0) {
    throw new Error('User isolation failure: found emails for invalid user ID');
  }

  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  console.log('🎉 Phase 10 Verified Successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Phase 10 verification failed:', err);
  process.exit(1);
});
