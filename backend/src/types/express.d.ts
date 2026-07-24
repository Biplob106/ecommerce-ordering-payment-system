import type { Role } from '@prisma/client';

/**
 * Adds our authenticated-user shape to Express's Request type.
 *
 * After the `authenticate` middleware runs, `req.user` is populated and fully
 * typed everywhere downstream.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
      };
    }
  }
}

export {};
