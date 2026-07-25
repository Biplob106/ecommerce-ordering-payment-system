import Stripe from 'stripe';
import { env } from '../config/env';

/**
 * A single shared Stripe client for the whole process.
 *
 * The SDK is stateless apart from its HTTP agent, so one instance is reused
 * everywhere rather than constructed per request. The API version is left at
 * the account default on purpose — pinning it here would force a code change on
 * every Stripe upgrade, and our usage (PaymentIntents, webhook verification) is
 * stable across versions.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY);
