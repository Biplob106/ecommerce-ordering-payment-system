import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from '../../middleware/auth';
import * as productController from './product.controller';

/**
 * Product routes, mounted at `<API_PREFIX>/products`.
 *
 *   GET    /            list (public; admins may include inactive)
 *   GET    /:id         fetch one (public)
 *   POST   /            create (admin)
 *   PATCH  /:id         update (admin)
 *   DELETE /:id         soft-delete / deactivate (admin)
 */
export const productRouter = Router();

const adminOnly = [authenticate, authorize('ADMIN')];

productRouter.get(
  '/',
  optionalAuthenticate,
  asyncHandler(productController.list),
);
productRouter.get('/:id', asyncHandler(productController.getOne));
productRouter.post('/', ...adminOnly, asyncHandler(productController.create));
productRouter.patch('/:id', ...adminOnly, asyncHandler(productController.update));
productRouter.delete(
  '/:id',
  ...adminOnly,
  asyncHandler(productController.remove),
);
