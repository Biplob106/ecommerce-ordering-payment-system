import type { NextFunction, Request, Response } from 'express';

/**
 * Wraps an async route handler so any rejected promise is forwarded to
 * Express's error middleware instead of crashing the process.
 *
 * Express 5 actually forwards rejected promises automatically, but wrapping
 * explicitly keeps the intent obvious and stays correct if a handler is ever
 * used in an Express 4 context.
 *
 *   router.post('/login', asyncHandler(authController.login));
 */
type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export const asyncHandler =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
