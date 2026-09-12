import { WebClient } from '@slack/web-api';
import { prisma } from '../config/prisma.js';
import { redisClient } from '../config/redis.js';
import { env } from '../config/env.js';

export class SlackService {
  /**
   * Generates the Slack OAuth 2.0 authorization URL
   */
  public static getOAuthUrl(userId: string): string {
    const scopes = ['chat:write', 'channels:read', 'incoming-webhook'];
    return (
      `https://slack.com/oauth/v2/authorize?` +
      `client_id=${encodeURIComponent(env.SLACK_CLIENT_ID)}&` +
      `scope=${encodeURIComponent(scopes.join(','))}&` +
      `redirect_uri=${encodeURIComponent(env.SLACK_REDIRECT_URI)}&` +
      `state=${encodeURIComponent(userId)}`
    );
  }

  /**
   * Exchanges OAuth authorization code for Slack access token and persists to DB
   */
  public static async handleOAuthCallback(code: string, userId: string) {
    const client = new WebClient();

    const response = await client.oauth.v2.access({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    });

    if (!response.ok || !response.access_token) {
      throw new Error(`Slack OAuth error: ${response.error || 'Failed to exchange token'}`);
    }

    const teamId = response.team?.id || 'unknown-team';
    const teamName = response.team?.name || 'Slack Workspace';
    const accessToken = response.access_token;
    const incomingWebhook = (response as any).incoming_webhook;

    const slackConn = await prisma.slackConnection.upsert({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
      create: {
        userId,
        teamId,
        teamName,
        accessToken,
        channelId: incomingWebhook?.channel_id || null,
        channelName: incomingWebhook?.channel || null,
        enabled: true,
      },
      update: {
        teamName,
        accessToken,
        channelId: incomingWebhook?.channel_id || null,
        channelName: incomingWebhook?.channel || null,
        enabled: true,
      },
    });

    return slackConn;
  }

  /**
   * Sends a live Slack notification when a sender hits the hourly rate limit.
   * Enforces Redis idempotency so only 1 alert is delivered per sender per hour window.
   */
  public static async notifyRateLimitHit(
    userId: string,
    senderEmail: string,
    limit: number,
  ): Promise<{ alerted: boolean; reason?: string }> {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const idempotencyKey = `slack:alerted:sender:${senderEmail}:hour:${yyyy}${mm}${dd}${hh}`;

    // Redis atomic lock: SET key 1 EX 7200 NX
    // If key already exists, notification was already dispatched for this hour
    const setSuccess = await redisClient.set(idempotencyKey, '1', 'EX', 7200, 'NX');
    if (!setSuccess) {
      return { alerted: false, reason: 'Already alerted for this hourly window' };
    }

    // Fetch active Slack connection for user
    const slackConn = await prisma.slackConnection.findFirst({
      where: { userId, enabled: true },
    });

    if (!slackConn) {
      return { alerted: false, reason: 'Slack not connected for user' };
    }

    try {
      const client = new WebClient(slackConn.accessToken);
      const messageText = `⚠️ *ReachInbox Hourly Rate Limit Reached*\nSender *${senderEmail}* reached the configured hourly sending limit of *${limit} emails*.\nRemaining emails have been safely rescheduled to the next hourly window.`;

      const channel = slackConn.channelId || '#general';

      await client.chat.postMessage({
        channel,
        text: messageText,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 ReachInbox — Hourly Limit Alert',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Sender *${senderEmail}* reached the configured hourly sending limit of *${limit} emails*.\nRemaining emails have been safely rescheduled to the next hourly window.`,
            },
          },
        ],
      });

      console.log(`💬 [SlackService] Live Slack alert sent to ${channel} for sender ${senderEmail}`);
      return { alerted: true };
    } catch (error: any) {
      console.error(`❌ [SlackService] Failed to post Slack message: ${error.message}`);
      // Do not throw; email flow must never break if Slack fails
      return { alerted: false, reason: error.message };
    }
  }
}
