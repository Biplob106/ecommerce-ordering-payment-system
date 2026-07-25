import { z } from 'zod';
import { PaymentProvider } from '@prisma/client';

/**
 * Validation for payment endpoints.
 *
 * Initiating a payment names the order to pay for and which provider to use.
 * The amount is NEVER taken from the client — it is read from the order on the
 * server, so a caller cannot pay less than the order is worth.
 */
export const initiatePaymentSchema = z.object({
  orderId: z.string().min(1),
  provider: z.nativeEnum(PaymentProvider),
});

/**
 * Query bKash appends when it redirects the buyer back to our callback. bKash
 * uses `status` values of `success`, `failure` and `cancel`.
 */
export const bkashCallbackSchema = z.object({
  paymentID: z.string().min(1),
  status: z.string().min(1),
});

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type BkashCallbackQuery = z.infer<typeof bkashCallbackSchema>;
