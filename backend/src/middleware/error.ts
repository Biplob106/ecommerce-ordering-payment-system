import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { isProduction } from '../config/env';

/**
 * Catch-all for unmatched routes. Placed after every real route so anything
 * that falls through becomes a clean 404 instead of Express's default HTML.
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
};

/**
 * The single place where every error becomes an HTTP response.
 *
 * Translates the error types the app produces into the right status code and a
 * consistent JSON envelope:
 *   { success: false, error: { message, details? } }
 *
 * Unknown errors are treated as genuine bugs: logged in full, but reported to
 * the client as a generic 500 so internals never leak.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Input validation failures from zod.
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // Errors we raised on purpose.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unique-constraint violation (e.g. registering an email that already exists).
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: { message: 'A record with that value already exists' },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: { message: 'Record not found' },
      });
      return;
    }
  }

  // Anything else is an unexpected bug.
  console.error('Unhandled error:', err);

  const fallbackMessage =
    !isProduction && err instanceof Error
      ? err.message
      : 'Internal server error';

  res.status(500).json({
    success: false,
    error: { message: fallbackMessage },
  });
};
