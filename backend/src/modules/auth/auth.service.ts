import { createHash } from 'node:crypto';
import type { User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import { AppError } from '../../utils/AppError';
import type { LoginInput, RegisterInput } from './auth.schema';

/**
 * Authentication logic: registration, login, and refresh-token rotation.
 *
 * Token strategy
 * --------------
 * On login/registration the user gets an access token (short-lived, used on
 * every request) and a refresh token (long-lived, used only to mint new access
 * tokens). We store only a SHA-256 hash of the refresh token in the database —
 * never the token itself — so a database leak cannot be used to impersonate
 * anyone. Each refresh rotates the token: the old one is revoked and a fresh
 * pair issued, which limits the damage if a refresh token is ever stolen.
 */

/** The safe view of a user returned to clients — never includes the hash. */
export type PublicUser = Pick<
  User,
  'id' | 'email' | 'name' | 'role' | 'createdAt'
>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  createdAt: user.createdAt,
});

/** Deterministic hash used to store and look up refresh tokens. */
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/**
 * Issues a fresh access + refresh pair and persists the refresh token's hash.
 * The refresh row's `expiresAt` is taken from the token's own `exp` claim so
 * the database and the token never disagree about expiry.
 */
const issueTokens = async (user: User): Promise<AuthTokens> => {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  const jti = createHash('sha256')
    .update(`${user.id}:${accessToken}`)
    .digest('hex');
  const refreshToken = signRefreshToken({ sub: user.id, jti });

  const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now());

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
};

export const register = async (input: RegisterInput): Promise<AuthResult> => {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw AppError.conflict('An account with that email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
    },
  });

  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
};

export const login = async (input: LoginInput): Promise<AuthResult> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  // Same error whether the email is unknown or the password is wrong — do not
  // reveal which accounts exist.
  const invalid = AppError.unauthorized('Invalid email or password');
  if (!user) {
    // Still run a hash comparison against a dummy value to keep the response
    // time similar to the valid-email path (mitigates user enumeration by
    // timing).
    await verifyPassword(input.password, DUMMY_HASH);
    throw invalid;
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw invalid;
  }

  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
};

/**
 * Exchanges a valid, non-revoked refresh token for a new token pair, rotating
 * (revoking) the old one. Rejects tokens that are expired, revoked, or unknown.
 */
export const refresh = async (refreshToken: string): Promise<AuthTokens> => {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revoked || stored.userId !== payload.sub) {
    throw AppError.unauthorized('Invalid refresh token');
  }
  if (stored.expiresAt.getTime() <= Date.now()) {
    throw AppError.unauthorized('Refresh token has expired');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw AppError.unauthorized('Invalid refresh token');
  }

  // Rotate: revoke the token just used, then issue a brand-new pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revoked: true },
  });

  return issueTokens(user);
};

/** Revokes a refresh token so it can no longer be used (logout). */
export const logout = async (refreshToken: string): Promise<void> => {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revoked: true },
  });
};

// A precomputed bcrypt hash of a random string, used only to equalise timing on
// the unknown-email login path. It never matches any real password.
const DUMMY_HASH =
  '$2a$12$C6UzMDM.H6dfI/f/IKcEeO3hI9zJb2m8w0oQ4B0m4a2r9m1nO0aVe';
