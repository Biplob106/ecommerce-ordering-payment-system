import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth';
import * as authController from './auth.controller';

/**
 * Auth routes, mounted at `<API_PREFIX>/auth`.
 *
 *   POST /register  create an account, returns user + tokens
 *   POST /login     exchange credentials for tokens
 *   POST /refresh   exchange a refresh token for a new token pair
 *   POST /logout    revoke a refresh token
 *   GET  /me        return the current authenticated user
 */
export const authRouter = Router();

authRouter.post('/register', asyncHandler(authController.register));
authRouter.post('/login', asyncHandler(authController.login));
authRouter.post('/refresh', asyncHandler(authController.refresh));
authRouter.post('/logout', asyncHandler(authController.logout));
authRouter.get('/me', authenticate, asyncHandler(authController.me));
