import { z } from 'zod';

/**
 * Request validation schemas for the auth endpoints.
 *
 * Controllers parse `req.body` through these before any logic runs, so the
 * service layer always receives well-formed, typed input. Invalid input becomes
 * a 400 via the central error handler (which understands ZodError).
 */

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  name: z.string().min(1, 'Name is required').max(120),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
