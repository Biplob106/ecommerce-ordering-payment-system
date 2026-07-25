import type Stripe from 'stripe';
import { stripe } from '../../../lib/stripe';
import { env } from '../../../config/env';

/**
 * Stripe strategy.
 *
 * Checkout with Stripe is a two-party dance:
 *
 *   1. The server creates a PaymentIntent for the exact order amount and hands
 *      its `client_secret` back to the browser. The browser confirms the card
 *      with Stripe.js — card details never touch our server.
 *   2. Stripe later calls our webhook to report the real outcome. That webhook,
 *      not the browser, is the source of truth that marks the order paid.
 *
 * Amounts are in minor units (cents), which is exactly how our database and
 * Stripe both store money, so no conversion is needed.
 */

export interface StripeInitResult {
  providerRef: string;
  clientSecret: string;
  publishableKey: string;
}

/**
 * Creates a PaymentIntent and returns everything the browser needs to confirm
 * it. The order id is stamped into metadata so the intent is traceable back to
 * an order from the Stripe dashboard.
 */
export const createStripePayment = async (
  amountMinorUnits: number,
  orderId: string,
): Promise<StripeInitResult> => {
  const intent = await stripe.paymentIntents.create({
    amount: amountMinorUnits,
    currency: env.STRIPE_CURRENCY,
    metadata: { orderId },
    automatic_payment_methods: { enabled: true },
  });

  if (!intent.client_secret) {
    throw new Error('Stripe did not return a client secret for the PaymentIntent');
  }

  return {
    providerRef: intent.id,
    clientSecret: intent.client_secret,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
  };
};

/**
 * Verifies a raw webhook payload against its `Stripe-Signature` header and
 * returns the typed event. Throws if the signature does not match, which the
 * controller turns into a 400 — an unverified webhook is never trusted.
 *
 * `rawBody` MUST be the exact bytes Stripe sent. Any JSON re-serialisation
 * changes the payload and breaks the signature, which is why the webhook route
 * is mounted with a raw body parser ahead of `express.json()`.
 */
export const verifyStripeWebhook = (
  rawBody: Buffer,
  signature: string,
): Stripe.Event =>
  stripe.webhooks.constructEvent(
    rawBody,
    signature,
    env.STRIPE_WEBHOOK_SECRET,
  );
