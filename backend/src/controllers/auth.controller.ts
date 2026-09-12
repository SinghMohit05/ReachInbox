import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { env } from '../config/env.js';
import { generateToken } from '../auth/jwt.js';
import { prisma } from '../config/prisma.js';

export const initiateGoogleLogin = (req: Request, res: Response, next: NextFunction) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend .env.',
        statusCode: 400,
        documentation: 'See README for Google OAuth Setup instructions.',
      },
    });
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    accessType: 'offline',
    prompt: 'consent',
  })(req, res, next);
};

export const handleGoogleCallback = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('google', { session: false }, (err: any, user: any, info: any) => {
    if (err) {
      console.error('Google OAuth callback error:', err);
      return res.redirect(`${env.FRONTEND_URL}/?error=${encodeURIComponent(err.message || 'OAuth error')}`);
    }

    if (!user) {
      const msg = info?.message || 'Authentication failed';
      return res.redirect(`${env.FRONTEND_URL}/?error=${encodeURIComponent(msg)}`);
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Set secure HTTP-only cookie
    res.cookie('reachinbox_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to frontend root with token
    return res.redirect(`${env.FRONTEND_URL}/?token=${token}`);
  })(req, res, next);
};

export const getCurrentUser = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: 'Unauthorized', statusCode: 401 },
    });
  }

  res.status(200).json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      avatarUrl: req.user.avatarUrl,
      senders: req.user.senders || [],
    },
  });
};

export const logout = (_req: Request, res: Response) => {
  res.clearCookie('reachinbox_token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};
