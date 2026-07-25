import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

/**
 * HTTP smoke tests.
 *
 * These hit the assembled Express app in-process (no port, no database). They
 * cover wiring that resolves before any database access: the health probe and
 * the authentication guard on payment routes, which rejects before a query is
 * ever issued.
 */
const app = createApp();

describe('GET /health', () => {
  it('reports the service is alive', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });
});

describe('payment route auth', () => {
  it('rejects starting a payment without a token', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .send({ orderId: 'x', provider: 'STRIPE' });
    expect(res.status).toBe(401);
  });

  it('rejects a refund without a token', async () => {
    const res = await request(app)
      .post('/api/v1/payments/refund')
      .send({ orderId: 'x' });
    expect(res.status).toBe(401);
  });
});
