import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/jwt.js';
import { prisma } from '../config/prisma.js';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;

    // 1. Check Authorization header: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // 2. Check Cookie: reachinbox_token
    if (!token && req.cookies && req.cookies.reachinbox_token) {
      token = req.cookies.reachinbox_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required. Please log in with Google.',
          statusCode: 401,
        },
      });
    }

    // 3. Verify JWT signature & expiration
    const payload = verifyToken(token);

    // 4. Fetch full user record with senders
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        senders: {
          where: { enabled: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'User session invalid. Account not found.',
          statusCode: 401,
        },
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid or expired authentication token.',
        statusCode: 401,
      },
    });
  }
};
