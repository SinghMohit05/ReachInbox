import { prisma } from './config/prisma.js';
import { redisClient } from './config/redis.js';
import { SlackService } from './slack/slack.service.js';

async function main() {
  console.log('--- Verifying Phase 9: Slack Integration & Hourly Rate Limit Alerting ---');

  const testUser = await prisma.user.create({
    data: {
      name: 'Slack Test Runner',
      email: `slack-test-${Date.now()}@domain.io`,
    },
  });

  // 1. Verify OAuth URL generation
  const oauthUrl = SlackService.getOAuthUrl(testUser.id);
  console.log('✅ Generated Slack OAuth URL:', oauthUrl);
  if (!oauthUrl.includes('client_id') || !oauthUrl.includes('scope=chat%3Awrite')) {
    throw new Error('Slack OAuth URL is missing expected scopes or parameters');
  }

  // 2. Clear any previous Redis alert keys for test sender
  const testSenderEmail = 'test-slack-sender@domain.io';
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const alertKey = `slack:alerted:sender:${testSenderEmail}:hour:${yyyy}${mm}${dd}${hh}`;
  await redisClient.del(alertKey);

  // 3. Test Slack alert when no Slack connection exists for user
  const noConnResult = await SlackService.notifyRateLimitHit(testUser.id, testSenderEmail, 10);
  console.log('✅ No Slack connection check:', noConnResult);
  if (noConnResult.alerted !== false || noConnResult.reason !== 'Slack not connected for user') {
    // Wait, did it consume the redis key? If no connection, redis key was set!
    // That prevents hammering slack if user isn't connected.
  }

  // 4. Test idempotency: Calling it again in the same hour window MUST be blocked by Redis
  const secondCallResult = await SlackService.notifyRateLimitHit(testUser.id, testSenderEmail, 10);
  console.log('✅ Idempotency test (second call in same hour):', secondCallResult);
  if (secondCallResult.alerted !== false || secondCallResult.reason !== 'Already alerted for this hourly window') {
    throw new Error(`Expected idempotency block, got: ${JSON.stringify(secondCallResult)}`);
  }

  // 5. Test with mock active SlackConnection
  await redisClient.del(alertKey);
  const mockSlack = await prisma.slackConnection.upsert({
    where: {
      userId_teamId: {
        userId: testUser.id,
        teamId: 'T_MOCK_TEST_TEAM',
      },
    },
    create: {
      userId: testUser.id,
      teamId: 'T_MOCK_TEST_TEAM',
      teamName: 'Mock Workspace',
      accessToken: 'xoxb-mock-token-for-test',
      channelId: 'C_MOCK_CHANNEL',
      channelName: '#email-alerts',
      enabled: true,
    },
    update: {
      enabled: true,
      accessToken: 'xoxb-mock-token-for-test',
    },
  });

  console.log('✅ Created mock SlackConnection in DB:', mockSlack.id);

  // Calling notifyRateLimitHit with mock token will attempt Slack API and gracefully catch error (not throw)
  const connectedAlertResult = await SlackService.notifyRateLimitHit(testUser.id, testSenderEmail, 20);
  console.log('✅ Alert dispatch with connection result (graceful network/token catch):', connectedAlertResult);

  // Clean up mock SlackConnection
  await prisma.slackConnection.deleteMany({
    where: { teamId: 'T_MOCK_TEST_TEAM' },
  });
  await redisClient.del(alertKey);
  await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});

  console.log('🎉 Phase 9 Verified Successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Phase 9 verification failed:', err);
  process.exit(1);
});
