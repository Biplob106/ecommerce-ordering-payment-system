import type { Request, Response } from 'express';
import * as orderService from './order.service';
import { createOrderSchema, listOrdersSchema } from './order.schema';

/**
 * HTTP layer for orders. Every route here is authenticated, so `req.user` is
 * always set.
 */

export const create = async (req: Request, res: Response): Promise<void> => {
  const input = createOrderSchema.parse(req.body);
  const order = await orderService.createOrder(req.user!.id, input);
  res.status(201).json({ success: true, data: { order } });
};

export const list = async (req: Request, res: Response): Promise<void> => {
  const query = listOrdersSchema.parse(req.query);
  const result = await orderService.listOrders(
    req.user!.id,
    req.user!.role,
    query,
  );
  res.status(200).json({ success: true, data: result });
};

export const getOne = async (req: Request, res: Response): Promise<void> => {
  const order = await orderService.getOrderForUser(
    req.params.id as string,
    req.user!.id,
    req.user!.role,
  );
  res.status(200).json({ success: true, data: { order } });
};

export const cancel = async (req: Request, res: Response): Promise<void> => {
  const order = await orderService.cancelOrder(
    req.params.id as string,
    req.user!.id,
    req.user!.role,
  );
  res.status(200).json({ success: true, data: { order } });
};

/** Admin-only. Marks a paid order fulfilled. */
export const fulfill = async (req: Request, res: Response): Promise<void> => {
  const order = await orderService.fulfillOrder(req.params.id as string);
  res.status(200).json({ success: true, data: { order } });
};
