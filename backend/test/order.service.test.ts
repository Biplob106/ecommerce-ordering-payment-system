import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderStatus, Role } from '@prisma/client';

/**
 * Order service tests.
 *
 * Prisma is mocked. These cover the checkout invariants: the server owns the
 * price (the client supplies only ids and quantities), stock is guarded on the
 * conditional decrement, and cancelling a pending order returns its stock.
 */

const prismaMock = vi.hoisted(() => {
  const p: any = {
    product: { findMany: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  p.$transaction = vi.fn(async (fn: any) => fn(p));
  // tx-scoped mocks reuse the same object
  p.product.updateMany = vi.fn();
  return p;
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import {
  createOrder,
  cancelOrder,
} from '../src/modules/order/order.service';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
});

describe('createOrder', () => {
  it('prices the order from the server catalogue, snapshots lines and decrements stock', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'A', priceAmount: 2500, currency: 'usd', stock: 10, active: true },
      { id: 'p2', name: 'B', priceAmount: 1000, currency: 'usd', stock: 5, active: true },
    ]);
    prismaMock.product.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.order.create.mockResolvedValue({ id: 'order_1' });

    await createOrder('user_1', {
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 3 },
      ],
    });

    // 2*2500 + 3*1000 = 8000, computed by the server not the client.
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          status: OrderStatus.PENDING,
          totalAmount: 8000,
          currency: 'usd',
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({
                productId: 'p1',
                productName: 'A',
                unitPrice: 2500,
                quantity: 2,
              }),
            ]),
          },
        }),
      }),
    );
    // Conditional decrement guards against overselling.
    expect(prismaMock.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1', stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      }),
    );
  });

  it('rejects when a product does not exist or is inactive', async () => {
    prismaMock.product.findMany.mockResolvedValue([]); // asked for 1, got 0
    await expect(
      createOrder('user_1', { items: [{ productId: 'ghost', quantity: 1 }] }),
    ).rejects.toThrow(/do not exist or are unavailable/i);
  });

  it('rejects an order mixing currencies', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'A', priceAmount: 100, currency: 'usd', stock: 5, active: true },
      { id: 'p2', name: 'B', priceAmount: 100, currency: 'bdt', stock: 5, active: true },
    ]);
    await expect(
      createOrder('user_1', {
        items: [
          { productId: 'p1', quantity: 1 },
          { productId: 'p2', quantity: 1 },
        ],
      }),
    ).rejects.toThrow(/one currency/i);
  });

  it('rejects up front when stock is insufficient', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'A', priceAmount: 100, currency: 'usd', stock: 1, active: true },
    ]);
    await expect(
      createOrder('user_1', { items: [{ productId: 'p1', quantity: 5 }] }),
    ).rejects.toThrow(/insufficient stock/i);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('rolls back when a concurrent buyer wins the last unit', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'A', priceAmount: 100, currency: 'usd', stock: 1, active: true },
    ]);
    // Passed the up-front check, but the conditional decrement matched no row.
    prismaMock.product.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      createOrder('user_1', { items: [{ productId: 'p1', quantity: 1 }] }),
    ).rejects.toThrow(/insufficient stock/i);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});

describe('cancelOrder', () => {
  it('restocks every item and marks a pending order cancelled', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      status: OrderStatus.PENDING,
      items: [{ productId: 'p1', quantity: 2 }],
      payments: [],
    });
    prismaMock.order.update.mockResolvedValue({
      id: 'order_1',
      status: OrderStatus.CANCELLED,
    });

    await cancelOrder('order_1', 'user_1', Role.CUSTOMER);

    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { stock: { increment: 2 } },
      }),
    );
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: OrderStatus.CANCELLED },
      }),
    );
  });

  it('rejects cancelling an order that is no longer pending', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 'order_1',
      userId: 'user_1',
      status: OrderStatus.PAID,
      items: [],
      payments: [],
    });
    await expect(
      cancelOrder('order_1', 'user_1', Role.CUSTOMER),
    ).rejects.toThrow(/only pending orders can be cancelled/i);
  });
});
