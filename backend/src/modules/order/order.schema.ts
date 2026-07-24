import { z } from 'zod';

/**
 * Validation for order endpoints.
 *
 * A checkout request is a list of line items, each naming a product and a
 * quantity. Prices are NOT taken from the client — the server looks them up and
 * snapshots them, so a caller cannot dictate what they pay.
 */

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().max(1000),
      }),
    )
    .min(1, 'An order needs at least one item'),
});

export const listOrdersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersSchema>;
