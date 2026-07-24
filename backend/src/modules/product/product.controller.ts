import type { Request, Response } from 'express';
import * as productService from './product.service';
import {
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
} from './product.schema';

/**
 * HTTP layer for products. Reads are open; write handlers sit behind
 * authenticate + authorize('ADMIN') in the router.
 */

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = listProductsSchema.parse(req.query);

  // Only admins may see inactive products; silently force it off for everyone
  // else so the flag cannot be used to peek at hidden catalogue entries.
  if (query.includeInactive && req.user?.role !== 'ADMIN') {
    query.includeInactive = false;
  }

  const result = await productService.listProducts(query);
  res.status(200).json({ success: true, data: result });
};

export const getOne = async (req: Request, res: Response): Promise<void> => {
  const product = await productService.getProductById(req.params.id as string);
  res.status(200).json({ success: true, data: { product } });
};

export const create = async (req: Request, res: Response): Promise<void> => {
  const input = createProductSchema.parse(req.body);
  const product = await productService.createProduct(input);
  res.status(201).json({ success: true, data: { product } });
};

export const update = async (req: Request, res: Response): Promise<void> => {
  const input = updateProductSchema.parse(req.body);
  const product = await productService.updateProduct(
    req.params.id as string,
    input,
  );
  res.status(200).json({ success: true, data: { product } });
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const product = await productService.deactivateProduct(
    req.params.id as string,
  );
  res.status(200).json({ success: true, data: { product } });
};
