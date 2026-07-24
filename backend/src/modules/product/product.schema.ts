import { z } from 'zod';

/**
 * Validation for product endpoints.
 *
 * Prices are integers in MINOR units (cents / poisha) to match how the whole
 * system stores money — see the schema design notes. Currency is a short code
 * like "usd" or "bdt".
 */

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).toLowerCase(),
  stock: z.number().int().nonnegative(),
  active: z.boolean().optional(),
});

// Every field optional on update, but at least one must be present.
export const updateProductSchema = createProductSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

// List query: pagination + optional text search. Coerced from string query
// params. `includeInactive` is honoured only for admins (enforced in the
// controller), letting staff see hidden products.
export const listProductsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).optional(),
  includeInactive: z.coerce.boolean().default(false),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsSchema>;
