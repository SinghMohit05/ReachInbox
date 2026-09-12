import { User, Sender } from '@prisma/client';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      avatarUrl?: string | null;
      senders?: Sender[];
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
