import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccessToken } from '../lib/jwt';
import { AppError } from '../utils/AppError';

/**
 * Requires a valid access token.
 *
 * Reads the `Authorization: Bearer <token>` header, verifies it, and attaches
 * `{ id, role }` to `req.user`. Any protected route mounts this first.
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or malformed Authorization header');
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifyAccessToken(token);

  req.user = { id: payload.sub, role: payload.role };
  next();
};

/**
 * Attaches `req.user` when a valid token is present, but does NOT reject the
 * request when it is missing. Used on public routes that behave differently for
 * logged-in users (e.g. admins seeing inactive products in the catalogue).
 */
export const optionalAuthenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
  }
  next();
};

/**
 * Requires the authenticated user to hold one of the given roles.
 * Must run after `authenticate`.
 *
 *   router.post('/products', authenticate, authorize('ADMIN'), handler)
 */
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    if (!roles.includes(req.user.role)) {
      throw AppError.forbidden('You do not have access to this resource');
    }
    next();
  };
