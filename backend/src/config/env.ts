import 'dotenv/config';
import { z } from 'zod';

/**
 * Central, validated configuration.
 *
 * Every environment variable the app relies on is declared here once, parsed
 * and type-checked with zod. If a required variable is missing or malformed the
 * process refuses to start with a clear message — far better than a mysterious
 * `undefined` surfacing deep inside a request months later.
 *
 * Import `env` anywhere instead of reaching into `process.env` directly; the
 * rest of the codebase then works with typed, guaranteed-present values.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  APP_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),

  // Access token: short-lived, sent on every request.
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),

  // Refresh token: long-lived, exchanged for new access tokens. A DIFFERENT
  // secret so leaking one does not compromise the other.
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // --- Stripe ---------------------------------------------------------------
  // Secret key drives server-side calls; the publishable key is handed to the
  // browser so Stripe.js can confirm the PaymentIntent. The webhook secret
  // proves an incoming webhook really came from Stripe.
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_CURRENCY: z.string().default('usd'),

  // --- bKash ----------------------------------------------------------------
  // Tokenized Checkout credentials. BKASH_MOCK swaps live sandbox calls for
  // deterministic fixtures so the full flow runs before merchant credentials
  // are approved.
  BKASH_BASE_URL: z
    .string()
    .url()
    .default('https://tokenized.sandbox.bka.sh/v1.2.0-beta'),
  BKASH_APP_KEY: z.string().min(1),
  BKASH_APP_SECRET: z.string().min(1),
  BKASH_USERNAME: z.string().min(1),
  BKASH_PASSWORD: z.string().min(1),
  BKASH_CALLBACK_URL: z.string().url(),
  BKASH_MOCK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loud. Flatten gives a readable field->errors map.
  console.error(
    'Invalid environment configuration:',
    parsed.error.flatten().fieldErrors,
  );
  throw new Error('Environment validation failed — see errors above.');
}

export const env = parsed.data;

/** Pre-split CORS allow-list, trimmed and empty entries removed. */
export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const isProduction = env.NODE_ENV === 'production';
