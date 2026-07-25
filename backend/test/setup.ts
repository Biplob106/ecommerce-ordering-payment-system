/**
 * Global test setup — runs before any test module is imported.
 *
 * The app's config layer (`src/config/env.ts`) validates a set of environment
 * variables the moment it is imported and throws if any are missing. Setting
 * them here, before the first import, lets the whole suite run without a real
 * `.env` file and without contacting any external service.
 *
 * `dotenv` (used inside env.ts) never overrides variables already present in
 * `process.env`, so these values win over anything in a local `.env`.
 */
const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '4000',
  API_PREFIX: '/api/v1',
  APP_URL: 'http://localhost:4000',
  CORS_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test?schema=public',
  JWT_SECRET: 'test_jwt_secret_at_least_32_characters_long_xx',
  JWT_REFRESH_SECRET: 'test_refresh_secret_at_least_32_characters_long',
  BCRYPT_SALT_ROUNDS: '10',
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  STRIPE_CURRENCY: 'usd',
  BKASH_BASE_URL: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta',
  BKASH_APP_KEY: 'test_app_key',
  BKASH_APP_SECRET: 'test_app_secret',
  BKASH_USERNAME: 'test_user',
  BKASH_PASSWORD: 'test_pass',
  BKASH_CALLBACK_URL: 'http://localhost:4000/api/v1/payments/bkash/callback',
  BKASH_MOCK: 'true',
};

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] = value;
}
