import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { productRouter } from '../modules/product/product.routes';
import { orderRouter } from '../modules/order/order.routes';

/**
 * The API router. Every feature module mounts its own sub-router here, and this
 * single router is attached under the configured API prefix in app.ts. New
 * modules (products, orders, payments) are added with one line each.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/orders', orderRouter);
