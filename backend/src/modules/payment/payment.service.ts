import {
  type Prisma,
  type Role,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { getOrderForUser } from '../order/order.service';
import {
  createStripePayment,
  verifyStripeWebhook,
} from './providers/stripe.provider';
import {
  createBkashPayment,
  executeBkashPayment,
} from './providers/bkash.provider';
import type { InitiatePaymentInput } from './payment.schema';

/**
 * Payment orchestration.
 *
 * The service owns the money-critical invariants; the provider modules only
 * know how to talk to Stripe or bKash. Two rules keep this correct:
 *
 * 1. **The order owns the amount.** Every charge is created for the order's
 *    stored total in minor units — the client never supplies an amount.
 *
 * 2. **Success is confirmed out-of-band and applied idempotently.** A browser
 *    round-trip is never trusted to mark an order paid; only a verified Stripe
 *    webhook or a bKash *execute* result does. Those handlers can fire more than
 *    once (retries, refreshes), so each transitions state only when it still
 *    needs to, and flips the order to PAID with a guard that leaves an already
 *    fulfilled or refunded order untouched.
 */

interface StripeInitiateResponse {
  paymentId: string;
  provider: 'STRIPE';
  clientSecret: string;
  publishableKey: string;
}

interface BkashInitiateResponse {
  paymentId: string;
  provider: 'BKASH';
  bkashURL: string;
}

export type InitiatePaymentResponse =
  | StripeInitiateResponse
  | BkashInitiateResponse;

/**
 * Starts a payment for an order the caller owns. Rejects orders that are not
 * PENDING (a paid or cancelled order cannot be paid again) and orders that
 * already have a succeeded payment.
 */
export const initiatePayment = async (
  userId: string,
  role: Role,
  input: InitiatePaymentInput,
): Promise<InitiatePaymentResponse> => {
  // Reuses the order module's ownership + visibility check.
  const order = await getOrderForUser(input.orderId, userId, role);

  if (order.status !== OrderStatus.PENDING) {
    throw AppError.conflict(
      `Order cannot be paid (its status is ${order.status})`,
    );
  }

  const alreadyPaid = order.payments.some(
    (p) => p.status === PaymentStatus.SUCCEEDED,
  );
  if (alreadyPaid) {
    throw AppError.conflict('This order has already been paid');
  }

  if (input.provider === PaymentProvider.STRIPE) {
    const result = await createStripePayment(order.totalAmount, order.id);
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.PENDING,
        amount: order.totalAmount,
        currency: env.STRIPE_CURRENCY,
        providerRef: result.providerRef,
      },
    });

    return {
      paymentId: payment.id,
      provider: 'STRIPE',
      clientSecret: result.clientSecret,
      publishableKey: result.publishableKey,
    };
  }

  // bKash
  const result = await createBkashPayment(order.totalAmount, order.id);
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: PaymentProvider.BKASH,
      status: PaymentStatus.PENDING,
      amount: order.totalAmount,
      currency: 'BDT',
      providerRef: result.providerRef,
    },
  });

  return {
    paymentId: payment.id,
    provider: 'BKASH',
    bkashURL: result.bkashURL,
  };
};

/**
 * Marks a payment succeeded and its order paid, once. Safe to call repeatedly:
 * if the payment is already succeeded it does nothing, and the order flips to
 * PAID only while it is still PENDING — an already fulfilled or refunded order
 * is left as-is.
 */
const settleSuccess = async (
  paymentId: string,
  orderId: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.SUCCEEDED, metadata },
    });
    await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.PAID },
    });
  });
};

const markFailed = async (
  paymentId: string,
  metadata: Prisma.InputJsonValue,
): Promise<void> => {
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: PaymentStatus.FAILED, metadata },
  });
};

/**
 * Verifies and processes a Stripe webhook. The raw request body and signature
 * header prove the event is genuine; an invalid signature throws (a 400 to
 * Stripe). Only intent success/failure events change state — everything else is
 * acknowledged and ignored.
 */
export const handleStripeWebhook = async (
  rawBody: Buffer,
  signature: string,
): Promise<void> => {
  let event;
  try {
    event = verifyStripeWebhook(rawBody, signature);
  } catch (err) {
    throw AppError.badRequest(
      `Stripe webhook signature verification failed: ${
        err instanceof Error ? err.message : 'unknown error'
      }`,
    );
  }

  if (
    event.type !== 'payment_intent.succeeded' &&
    event.type !== 'payment_intent.payment_failed'
  ) {
    return; // acknowledged, nothing to do
  }

  const intent = event.data.object as { id: string };
  const payment = await prisma.payment.findFirst({
    where: {
      provider: PaymentProvider.STRIPE,
      providerRef: intent.id,
    },
  });

  // Unknown intent, or already settled — nothing to do.
  if (!payment || payment.status !== PaymentStatus.PENDING) {
    return;
  }

  const metadata = event as unknown as Prisma.InputJsonValue;
  if (event.type === 'payment_intent.succeeded') {
    await settleSuccess(payment.id, payment.orderId, metadata);
  } else {
    await markFailed(payment.id, metadata);
  }
};

export interface BkashCallbackResult {
  status: 'success' | 'failed';
  orderId: string;
  paymentId: string;
}

/**
 * Handles the redirect bKash makes back to us after the buyer authorises (or
 * declines) a payment. On a `success` status we *execute* the payment — the
 * execute result, not the redirect, decides the outcome. Any other status is a
 * cancellation or failure.
 */
export const handleBkashCallback = async (
  paymentID: string,
  status: string,
): Promise<BkashCallbackResult> => {
  const payment = await prisma.payment.findFirst({
    where: {
      provider: PaymentProvider.BKASH,
      providerRef: paymentID,
    },
  });
  if (!payment) {
    throw AppError.notFound('Unknown bKash payment');
  }

  // Already settled — report its current outcome without re-executing.
  if (payment.status !== PaymentStatus.PENDING) {
    return {
      status:
        payment.status === PaymentStatus.SUCCEEDED ? 'success' : 'failed',
      orderId: payment.orderId,
      paymentId: payment.id,
    };
  }

  if (status !== 'success') {
    await markFailed(payment.id, { callbackStatus: status });
    return { status: 'failed', orderId: payment.orderId, paymentId: payment.id };
  }

  const execution = await executeBkashPayment(paymentID);
  const metadata = execution.raw as Prisma.InputJsonValue;

  if (execution.success) {
    await settleSuccess(payment.id, payment.orderId, metadata);
    return {
      status: 'success',
      orderId: payment.orderId,
      paymentId: payment.id,
    };
  }

  await markFailed(payment.id, metadata);
  return { status: 'failed', orderId: payment.orderId, paymentId: payment.id };
};
