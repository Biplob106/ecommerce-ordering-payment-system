import type { Request, Response } from 'express';
import { corsOrigins } from '../../config/env';
import { AppError } from '../../utils/AppError';
import * as paymentService from './payment.service';
import {
  initiatePaymentSchema,
  bkashCallbackSchema,
  refundSchema,
} from './payment.schema';

/**
 * HTTP layer for payments.
 *
 * `initiate` is authenticated (the buyer starts their own payment). The Stripe
 * webhook and the bKash callback are called by the providers, not the buyer, so
 * they are public — the webhook is instead secured by signature verification,
 * and the callback only reports the outcome of a payment it can already find.
 */

/** Where a buyer's browser is sent after the bKash flow resolves. */
const frontendResultUrl = (
  status: string,
  orderId: string,
): string => {
  const base = corsOrigins[0] ?? 'http://localhost:3000';
  return `${base}/payment/result?status=${status}&orderId=${orderId}`;
};

export const initiate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const input = initiatePaymentSchema.parse(req.body);
  const result = await paymentService.initiatePayment(
    req.user!.id,
    req.user!.role,
    input,
  );
  res.status(201).json({ success: true, data: result });
};

/**
 * Stripe calls this. The body is the raw bytes (mounted with a raw parser in
 * app.ts) so the signature can be verified. We always answer 200 once the event
 * is processed, so Stripe stops retrying.
 */
export const stripeWebhook = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const signature = req.headers['stripe-signature'];
  if (typeof signature !== 'string') {
    throw AppError.badRequest('Missing Stripe-Signature header');
  }
  // `req.body` is a Buffer here because the raw body parser handles this route.
  await paymentService.handleStripeWebhook(req.body as Buffer, signature);
  res.status(200).json({ received: true });
};

/**
 * bKash redirects the buyer's browser here after they authorise or decline.
 * We settle the payment and then redirect the browser on to the frontend's
 * result page — this endpoint is navigated to, not fetched, so it returns a
 * redirect rather than JSON.
 */
export const bkashCallback = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { paymentID, status } = bkashCallbackSchema.parse(req.query);
  const result = await paymentService.handleBkashCallback(paymentID, status);
  res.redirect(frontendResultUrl(result.status, result.orderId));
};

/**
 * Admin-only. Refunds a paid order back through its original provider and
 * returns the updated order.
 */
export const refund = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { orderId } = refundSchema.parse(req.body);
  const order = await paymentService.refundOrder(orderId);
  res.status(200).json({ success: true, data: { order } });
};
