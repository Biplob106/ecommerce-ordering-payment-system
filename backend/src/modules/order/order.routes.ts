import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/auth';
import * as orderController from './order.controller';

/**
 * Order routes, mounted at `<API_PREFIX>/orders`. Every route requires a valid
 * access token.
 *
 *   POST /             place an order (checkout)
 *   GET  /             list your orders (admins see all)
 *   GET  /:id          fetch one of your orders (admins see any)
 *   POST /:id/cancel   cancel a pending order and restock it
 */
export const orderRouter = Router();

orderRouter.use(authenticate);

orderRouter.post('/', asyncHandler(orderController.create));
orderRouter.get('/', asyncHandler(orderController.list));
orderRouter.get('/:id', asyncHandler(orderController.getOne));
orderRouter.post('/:id/cancel', asyncHandler(orderController.cancel));
