import { defineConfig } from 'vitest/config';

/**
 * Test runner configuration.
 *
 * Tests are hermetic: they mock the Prisma client and the payment providers, so
 * no database, Redis, Stripe or bKash connection is needed to run the suite.
 * `test/setup.ts` pins every environment variable the app validates at import
 * time, so the config module loads cleanly without a real `.env`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
