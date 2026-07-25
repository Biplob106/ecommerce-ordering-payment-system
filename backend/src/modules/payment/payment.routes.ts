import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth';
import * as paymentController from './payment.controller';

/**
 * Payment routes, mounted at `<API_PREFIX>/payments`.
 *
 *   POST /                  start a payment for one of your orders (auth)
 *   POST /stripe/webhook    Stripe event sink (public, signature-verified)
 *   GET  /bkash/callback    bKash redirect target (public)
 *
 * Only the buyer-facing `POST /` requires a token. The webhook and callback are
 * invoked by the providers, not the buyer: the webhook proves itself with a
 * signature, and the callback merely settles a payment it can already find, so
 * neither carries an access token.
 *
 * NOTE: the raw body parser the Stripe webhook needs is mounted in app.ts, ahead
 * of the JSON parser — it cannot live here because app-level body parsing runs
 * before this router.
 */
export const paymentRouter = Router();

paymentRouter.post('/', authenticate, asyncHandler(paymentController.initiate));
paymentRouter.post(
  '/stripe/webhook',
  asyncHandler(paymentController.stripeWebhook),
);
paymentRouter.get(
  '/bkash/callback',
  asyncHandler(paymentController.bkashCallback),
);
