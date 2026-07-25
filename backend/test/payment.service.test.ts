import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
} from '@prisma/client';

/**
 * Payment service tests.
 *
 * The Prisma client and both payment providers are mocked, so these tests
 * exercise the service's own rules — amount ownership, status guards, idempotent
 * settlement and refund reversal — without a database or any provider call.
 */

// Hoisted so the mock factories below can reference them (vi.mock is lifted
// above imports, before any top-level const would be initialised).
const prismaMock = vi.hoisted(() => {
  const p: any = {
    order: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    product: { update: vi.fn() },
  };
  p.$transaction = vi.fn(async (fn: any) => fn(p));
  return p;
});

const providers = vi.hoisted(() => ({
  createStripePayment: vi.fn(),
  refundStripePayment: vi.fn(),
  verifyStripeWebhook: vi.fn(),
  createBkashPayment: vi.fn(),
  executeBkashPayment: vi.fn(),
  refundBkashPayment: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/modules/payment/providers/stripe.provider', () => ({
  createStripePayment: providers.createStripePayment,
  refundStripePayment: providers.refundStripePayment,
  verifyStripeWebhook: providers.verifyStripeWebhook,
}));
vi.mock('../src/modules/payment/providers/bkash.provider', () => ({
  createBkashPayment: providers.createBkashPayment,
  executeBkashPayment: providers.executeBkashPayment,
  refundBkashPayment: providers.refundBkashPayment,
}));

import {
  initiatePayment,
  handleStripeWebhook,
  handleBkashCallback,
  refundOrder,
} from '../src/modules/payment/payment.service';

const USER_ID = 'user_1';

const makeOrder = (overrides: Record<string, any> = {}) => ({
  id: 'order_1',
  userId: USER_ID,
  status: OrderStatus.PENDING,
  totalAmount: 5000,
  currency: 'usd',
  items: [{ productId: 'prod_1', quantity: 2, productName: 'X', unitPrice: 2500 }],
  payments: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks wipes call history but keeps implementations; the transaction
  // passthrough must be re-established because clear does not restore it.
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
});

describe('initiatePayment', () => {
  it('creates a Stripe payment for the order amount and returns the client secret', async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder());
    providers.createStripePayment.mockResolvedValue({
      providerRef: 'pi_1',
      clientSecret: 'cs_1',
      publishableKey: 'pk_test',
    });
    prismaMock.payment.create.mockResolvedValue({ id: 'pay_1' });

    const result = await initiatePayment(USER_ID, 'CUSTOMER', {
      orderId: 'order_1',
      provider: PaymentProvider.STRIPE,
    });

    expect(providers.createStripePayment).toHaveBeenCalledWith(5000, 'order_1');
    expect(prismaMock.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order_1',
          provider: PaymentProvider.STRIPE,
          status: PaymentStatus.PENDING,
          amount: 5000,
          providerRef: 'pi_1',
        }),
      }),
    );
    expect(result).toMatchObject({
      provider: 'STRIPE',
      clientSecret: 'cs_1',
      publishableKey: 'pk_test',
      paymentId: 'pay_1',
    });
  });

  it('creates a bKash payment and returns the redirect URL', async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder());
    providers.createBkashPayment.mockResolvedValue({
      providerRef: 'MOCK-order_1',
      bkashURL: 'https://bkash/redirect',
    });
    prismaMock.payment.create.mockResolvedValue({ id: 'pay_2' });

    const result = await initiatePayment(USER_ID, 'CUSTOMER', {
      orderId: 'order_1',
      provider: PaymentProvider.BKASH,
    });

    expect(result).toMatchObject({
      provider: 'BKASH',
      bkashURL: 'https://bkash/redirect',
      paymentId: 'pay_2',
    });
  });

  it('rejects paying an order that is not pending', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      makeOrder({ status: OrderStatus.PAID }),
    );
    await expect(
      initiatePayment(USER_ID, 'CUSTOMER', {
        orderId: 'order_1',
        provider: PaymentProvider.STRIPE,
      }),
    ).rejects.toThrow(/cannot be paid/i);
    expect(providers.createStripePayment).not.toHaveBeenCalled();
  });

  it('rejects an order that already has a succeeded payment', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      makeOrder({ payments: [{ status: PaymentStatus.SUCCEEDED }] }),
    );
    await expect(
      initiatePayment(USER_ID, 'CUSTOMER', {
        orderId: 'order_1',
        provider: PaymentProvider.STRIPE,
      }),
    ).rejects.toThrow(/already been paid/i);
  });
});

describe('handleStripeWebhook', () => {
  const sig = 'sig';

  it('marks the payment succeeded and the order paid on payment_intent.succeeded', async () => {
    providers.verifyStripeWebhook.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1' } },
    });
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      orderId: 'order_1',
      status: PaymentStatus.PENDING,
    });

    await handleStripeWebhook(Buffer.from('{}'), sig);

    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay_1' },
        data: expect.objectContaining({ status: PaymentStatus.SUCCEEDED }),
      }),
    );
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order_1', status: OrderStatus.PENDING },
        data: { status: OrderStatus.PAID },
      }),
    );
  });

  it('is idempotent — does nothing when the payment is already settled', async () => {
    providers.verifyStripeWebhook.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1' } },
    });
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      orderId: 'order_1',
      status: PaymentStatus.SUCCEEDED,
    });

    await handleStripeWebhook(Buffer.from('{}'), sig);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('marks the payment failed on payment_intent.payment_failed without touching the order', async () => {
    providers.verifyStripeWebhook.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_1' } },
    });
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      orderId: 'order_1',
      status: PaymentStatus.PENDING,
    });

    await handleStripeWebhook(Buffer.from('{}'), sig);

    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    );
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a payload whose signature does not verify', async () => {
    providers.verifyStripeWebhook.mockImplementation(() => {
      throw new Error('bad signature');
    });
    await expect(
      handleStripeWebhook(Buffer.from('{}'), 'wrong'),
    ).rejects.toThrow(/signature verification failed/i);
  });

  it('ignores event types it does not handle', async () => {
    providers.verifyStripeWebhook.mockReturnValue({
      type: 'charge.updated',
      data: { object: { id: 'ch_1' } },
    });
    await handleStripeWebhook(Buffer.from('{}'), sig);
    expect(prismaMock.payment.findFirst).not.toHaveBeenCalled();
  });
});

describe('handleBkashCallback', () => {
  it('executes and settles the payment on a success status', async () => {
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      orderId: 'order_1',
      status: PaymentStatus.PENDING,
    });
    providers.executeBkashPayment.mockResolvedValue({
      success: true,
      trxID: 'TRX1',
      raw: { transactionStatus: 'Completed', trxID: 'TRX1' },
    });

    const result = await handleBkashCallback('paymentID_1', 'success');

    expect(providers.executeBkashPayment).toHaveBeenCalledWith('paymentID_1');
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: OrderStatus.PAID } }),
    );
    expect(result).toEqual({
      status: 'success',
      orderId: 'order_1',
      paymentId: 'pay_1',
    });
  });

  it('marks the payment failed and does not execute on a non-success status', async () => {
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      orderId: 'order_1',
      status: PaymentStatus.PENDING,
    });

    const result = await handleBkashCallback('paymentID_1', 'failure');

    expect(providers.executeBkashPayment).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    );
    expect(result.status).toBe('failed');
  });

  it('rejects an unknown payment id', async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);
    await expect(
      handleBkashCallback('nope', 'success'),
    ).rejects.toThrow(/unknown bkash payment/i);
  });
});

describe('refundOrder', () => {
  it('refunds a paid Stripe order, marks it refunded and restocks every item', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      makeOrder({
        status: OrderStatus.PAID,
        payments: [
          {
            id: 'pay_1',
            provider: PaymentProvider.STRIPE,
            status: PaymentStatus.SUCCEEDED,
            providerRef: 'pi_1',
            amount: 5000,
            metadata: null,
          },
        ],
      }),
    );
    providers.refundStripePayment.mockResolvedValue({
      refundRef: 're_1',
      raw: { id: 're_1' },
    });
    prismaMock.order.update.mockResolvedValue({
      id: 'order_1',
      status: OrderStatus.REFUNDED,
    });

    const result = await refundOrder('order_1');

    expect(providers.refundStripePayment).toHaveBeenCalledWith('pi_1', 5000);
    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.REFUNDED }),
      }),
    );
    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod_1' },
        data: { stock: { increment: 2 } },
      }),
    );
    expect(result.status).toBe(OrderStatus.REFUNDED);
  });

  it('rejects refunding an order that is already refunded', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      makeOrder({ status: OrderStatus.REFUNDED }),
    );
    await expect(refundOrder('order_1')).rejects.toThrow(/already been refunded/i);
  });

  it('rejects when the order has no succeeded payment', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      makeOrder({ status: OrderStatus.PAID, payments: [] }),
    );
    await expect(refundOrder('order_1')).rejects.toThrow(/no successful payment/i);
  });

  it('rejects refunding an order that was never paid', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      makeOrder({ status: OrderStatus.PENDING }),
    );
    await expect(refundOrder('order_1')).rejects.toThrow(/only a paid order/i);
  });
});
