import { type Prisma, OrderStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import type { CreateOrderInput, ListOrdersQuery } from './order.schema';
import type { Paginated } from '../product/product.service';

/**
 * Order logic — the checkout core.
 *
 * Two rules make this safe and correct:
 *
 * 1. **The server owns the price.** Clients send only product ids and
 *    quantities. The server looks up each product, copies its current name and
 *    unit price onto the order line (a snapshot), and computes the total. A
 *    client can never dictate what it pays, and a later price change never
 *    rewrites this order.
 *
 * 2. **Stock is decremented atomically.** Everything — the conditional stock
 *    decrement and the order creation — happens inside one database
 *    transaction. The decrement uses `updateMany ... where stock >= quantity`,
 *    so two shoppers racing for the last unit cannot both succeed: whoever
 *    loses gets a clean "out of stock" instead of driving stock negative.
 */

const orderInclude = { items: true, payments: true } satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

export const createOrder = async (
  userId: string,
  input: CreateOrderInput,
): Promise<OrderWithRelations> => {
  // Collapse duplicate product ids so the same product listed twice becomes one
  // line with the summed quantity.
  const quantityByProduct = new Map<string, number>();
  for (const item of input.items) {
    quantityByProduct.set(
      item.productId,
      (quantityByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }
  const productIds = [...quantityByProduct.keys()];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
  });

  if (products.length !== productIds.length) {
    throw AppError.badRequest(
      'One or more products do not exist or are unavailable',
    );
  }

  // Every line must share one currency — we cannot sum usd and bdt.
  const currencies = new Set(products.map((p) => p.currency));
  if (currencies.size > 1) {
    throw AppError.badRequest('All items in an order must use one currency');
  }
  const currency = products[0]!.currency;

  // Build the snapshotted line items and the total, checking stock up front so
  // an obviously impossible order fails before we open a transaction.
  const lineItems = products.map((product) => {
    const quantity = quantityByProduct.get(product.id)!;
    if (product.stock < quantity) {
      throw AppError.conflict(`Insufficient stock for "${product.name}"`);
    }
    return {
      productId: product.id,
      productName: product.name,
      unitPrice: product.priceAmount,
      quantity,
    };
  });

  const totalAmount = lineItems.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );

  // Atomic: decrement stock conditionally, then create the order. If any
  // decrement finds insufficient stock (a race with another buyer), the whole
  // transaction rolls back.
  return prisma.$transaction(async (tx) => {
    for (const line of lineItems) {
      const result = await tx.product.updateMany({
        where: { id: line.productId, stock: { gte: line.quantity } },
        data: { stock: { decrement: line.quantity } },
      });
      if (result.count === 0) {
        throw AppError.conflict(
          `Insufficient stock for "${line.productName}"`,
        );
      }
    }

    return tx.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING,
        totalAmount,
        currency,
        items: { create: lineItems },
      },
      include: orderInclude,
    });
  });
};

/**
 * Marks a paid order as fulfilled (admin only — enforced by route middleware).
 *
 * Fulfilment is the shipped/handed-over milestone, so only a PAID order can
 * make the move. An unpaid, cancelled, refunded or already-fulfilled order is
 * rejected, keeping the status a strict PENDING -> PAID -> FULFILLED line.
 */
export const fulfillOrder = async (
  orderId: string,
): Promise<OrderWithRelations> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!order) {
    throw AppError.notFound('Order not found');
  }

  if (order.status !== OrderStatus.PAID) {
    throw AppError.conflict(
      `Only a paid order can be fulfilled (its status is ${order.status})`,
    );
  }

  return prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.FULFILLED },
    include: orderInclude,
  });
};

export const listOrders = async (
  userId: string,
  role: Role,
  query: ListOrdersQuery,
): Promise<Paginated<OrderWithRelations>> => {
  const { page, limit } = query;

  // Customers see only their own orders; admins see everyone's.
  const where: Prisma.OrderWhereInput =
    role === Role.ADMIN ? {} : { userId };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const getOrderForUser = async (
  orderId: string,
  userId: string,
  role: Role,
): Promise<OrderWithRelations> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!order) {
    throw AppError.notFound('Order not found');
  }
  // A customer may only see their own order; an admin may see any.
  if (role !== Role.ADMIN && order.userId !== userId) {
    throw AppError.notFound('Order not found');
  }
  return order;
};

/**
 * Cancels a PENDING order and returns its stock to the catalogue. Only the
 * owner (or an admin) may cancel, and only while the order is still PENDING —
 * once it is paid, cancellation becomes a refund concern handled elsewhere.
 */
export const cancelOrder = async (
  orderId: string,
  userId: string,
  role: Role,
): Promise<OrderWithRelations> => {
  const order = await getOrderForUser(orderId, userId, role);

  if (order.status !== OrderStatus.PENDING) {
    throw AppError.conflict(
      `Only pending orders can be cancelled (this order is ${order.status})`,
    );
  }

  return prisma.$transaction(async (tx) => {
    for (const line of order.items) {
      await tx.product.update({
        where: { id: line.productId },
        data: { stock: { increment: line.quantity } },
      });
    }

    return tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED },
      include: orderInclude,
    });
  });
};
