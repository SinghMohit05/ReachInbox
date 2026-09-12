import { Request, Response } from 'express';
import { SlackService } from '../slack/slack.service.js';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

export const initiateSlackOAuth = (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Slack OAuth is not configured. Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in backend .env.',
        statusCode: 400,
      },
    });
  }

  const url = SlackService.getOAuthUrl(req.user.id);
  res.redirect(url);
};

export const handleSlackCallback = async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const userId = req.query.state as string;

  if (!code || !userId) {
    return res.redirect(`${env.FRONTEND_URL}?slack_error=missing_code_or_state`);
  }

  try {
    await SlackService.handleOAuthCallback(code, userId);
    res.redirect(`${env.FRONTEND_URL}?slack_connected=true`);
  } catch (error: any) {
    console.error('Slack OAuth callback error:', error);
    res.redirect(`${env.FRONTEND_URL}?slack_error=${encodeURIComponent(error.message)}`);
  }
};

export const getSlackStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  const connection = await prisma.slackConnection.findFirst({
    where: { userId: req.user.id, enabled: true },
  });

  res.status(200).json({
    success: true,
    connected: !!connection,
    connection: connection
      ? {
          teamId: connection.teamId,
          teamName: connection.teamName,
          channelName: connection.channelName,
          connectedAt: connection.createdAt,
        }
      : null,
  });
};

export const disconnectSlack = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Unauthorized', statusCode: 401 } });
  }

  await prisma.slackConnection.deleteMany({
    where: { userId: req.user.id },
  });

  res.status(200).json({
    success: true,
    message: 'Slack disconnected successfully',
  });
};
