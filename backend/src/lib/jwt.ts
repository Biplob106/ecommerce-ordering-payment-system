import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/**
 * JSON Web Token helpers.
 *
 * Two token types:
 *   - Access token  — short-lived (minutes), sent on every API request in the
 *     Authorization header. Carries the user id and role so the API can
 *     authorise without a database hit.
 *   - Refresh token — long-lived (days), used only to obtain new access tokens.
 *     Each carries a unique `jti` so a specific token can be tracked and
 *     revoked in the database.
 *
 * The two are signed with DIFFERENT secrets, so a leaked access token can never
 * be replayed as a refresh token or vice-versa.
 */

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
}

export interface RefreshTokenPayload {
  sub: string; // user id
  jti: string; // unique token id, matched against the RefreshToken table
}

const accessOptions: SignOptions = {
  expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
};

const refreshOptions: SignOptions = {
  expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
};

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, accessOptions);

export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, refreshOptions);

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
  } catch {
    throw AppError.unauthorized('Invalid or expired access token');
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
};
