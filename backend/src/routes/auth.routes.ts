import { Router } from 'express';
import {
  initiateGoogleLogin,
  handleGoogleCallback,
  getCurrentUser,
  logout,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

import {
  initiateSlackOAuth,
  handleSlackCallback,
  getSlackStatus,
  disconnectSlack,
} from '../controllers/slack.controller.js';

import { env } from '../config/env.js';

export const authRouter = Router();

authRouter.get('/google', initiateGoogleLogin);
authRouter.get('/google/callback', handleGoogleCallback);
authRouter.get('/callback', (req, res) => {
  const token = req.query.token as string;
  const error = req.query.error as string;
  if (error) {
    return res.redirect(`${env.FRONTEND_URL}/?error=${encodeURIComponent(error)}`);
  }
  return res.redirect(`${env.FRONTEND_URL}/?token=${encodeURIComponent(token || '')}`);
});
authRouter.get('/me', requireAuth, getCurrentUser);
authRouter.post('/logout', logout);

// Slack OAuth & Status Endpoints
authRouter.get('/slack', requireAuth, initiateSlackOAuth);
authRouter.get('/slack/callback', handleSlackCallback);
authRouter.get('/slack/status', requireAuth, getSlackStatus);
authRouter.post('/slack/disconnect', requireAuth, disconnectSlack);
