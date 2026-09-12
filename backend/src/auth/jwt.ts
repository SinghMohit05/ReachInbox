import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface TokenPayload {
  userId: string;
  email: string;
}

export const generateToken = (user: { id?: string; userId?: string; email: string }): string => {
  const userId = user.userId || user.id;
  if (!userId) throw new Error('Cannot generate token without userId');
  return jwt.sign({ userId, email: user.email }, env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
};
