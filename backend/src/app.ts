import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { env } from './config/env.js';
import { configurePassport } from './auth/passport.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { emailRouter } from './routes/email.routes.js';
import { createBullBoardDashboard } from './queues/bullboard.js';
import { errorHandler } from './middleware/errorHandler.js';

export const createApp = (): Express => {
  const app = express();

  // Configure Passport strategies
  configurePassport();

  // Security headers (disable CSP for Bull Board dashboard assets)
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS setup
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          origin === env.FRONTEND_URL ||
          origin === 'http://localhost:5173' ||
          origin === 'http://127.0.0.1:5173' ||
          origin.endsWith('.vercel.app')
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    }),
  );

  // Parsers & Passport
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(passport.initialize());

  // Basic request logger in development
  if (env.NODE_ENV === 'development') {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
      next();
    });
  }

  // Bull Board Live Dashboard
  app.use('/admin/queues', createBullBoardDashboard());

  // Route registration
  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api', emailRouter);

  // Catch-all 404
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        message: `Cannot ${req.method} ${req.path}`,
        statusCode: 404,
      },
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
};
