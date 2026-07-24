import type { Request, Response } from 'express';
import * as authService from './auth.service';
import { loginSchema, refreshSchema, registerSchema } from './auth.schema';

/**
 * HTTP layer for auth. Each handler validates the request body, delegates to
 * the service, and returns the standard `{ success, data }` envelope. Errors
 * bubble up to the central error handler via asyncHandler.
 */

export const register = async (req: Request, res: Response): Promise<void> => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  res.status(201).json({ success: true, data: result });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.status(200).json({ success: true, data: result });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokens = await authService.refresh(refreshToken);
  res.status(200).json({ success: true, data: { tokens } });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = refreshSchema.parse(req.body);
  await authService.logout(refreshToken);
  res.status(200).json({ success: true, data: { message: 'Logged out' } });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  // `authenticate` guarantees req.user is set before this runs.
  res.status(200).json({ success: true, data: { user: req.user } });
};
