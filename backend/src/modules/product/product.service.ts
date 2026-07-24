import type { Prisma, Product } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/AppError';
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from './product.schema';

/**
 * Product catalogue logic.
 *
 * Reads are public; writes are admin-only (enforced by route middleware).
 * "Deleting" a product is a soft delete — we flip `active` to false rather than
 * removing the row, because past orders reference it through OrderItem and must
 * keep working.
 */

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const listProducts = async (
  query: ListProductsQuery,
): Promise<Paginated<Product>> => {
  const { page, limit, search, includeInactive } = query;

  const where: Prisma.ProductWhereInput = {
    ...(includeInactive ? {} : { active: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const getProductById = async (id: string): Promise<Product> => {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw AppError.notFound('Product not found');
  }
  return product;
};

export const createProduct = (input: CreateProductInput): Promise<Product> =>
  prisma.product.create({ data: input });

export const updateProduct = async (
  id: string,
  input: UpdateProductInput,
): Promise<Product> => {
  await getProductById(id); // 404 if missing
  return prisma.product.update({ where: { id }, data: input });
};

/** Soft delete: hide the product without breaking historical orders. */
export const deactivateProduct = async (id: string): Promise<Product> => {
  await getProductById(id);
  return prisma.product.update({ where: { id }, data: { active: false } });
};
