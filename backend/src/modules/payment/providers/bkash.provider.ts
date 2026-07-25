import { env } from '../../../config/env';

/**
 * bKash Tokenized Checkout strategy.
 *
 * Unlike Stripe, bKash has no official SDK, so this talks to the REST API
 * directly with `fetch`. The flow is:
 *
 *   1. Grant an id-token (short-lived, cached in memory and reused).
 *   2. Create a payment → bKash returns a `paymentID` and a `bkashURL`. The
 *      browser is redirected to that URL to authorise the payment.
 *   3. bKash redirects the buyer back to our callback with the `paymentID` and
 *      a status. We then *execute* the payment to get the final outcome — the
 *      execute response, not the redirect status, is the source of truth.
 *
 * When `BKASH_MOCK` is true every network call is replaced by a deterministic
 * fixture, so the whole checkout can be demonstrated and tested without live
 * sandbox credentials.
 *
 * bKash amounts are major-unit decimal strings ("100.00"), whereas we store
 * money in minor units, so amounts are divided by 100 on the way out.
 */

export interface BkashCreateResult {
  providerRef: string; // bKash paymentID
  bkashURL: string; // where the browser is redirected to authorise
}

export interface BkashExecuteResult {
  success: boolean;
  trxID?: string;
  raw: unknown;
}

const toMajorUnits = (minor: number): string => (minor / 100).toFixed(2);

// --- token cache -----------------------------------------------------------
// bKash id-tokens last ~1 hour. We cache the token and refresh a minute before
// expiry so a request never rides on a token that dies mid-flight.
let cachedToken: { value: string; expiresAt: number } | null = null;

const grantToken = async (): Promise<string> => {
  if (env.BKASH_MOCK) {
    return 'mock-id-token';
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const res = await fetch(
    `${env.BKASH_BASE_URL}/tokenized/checkout/token/grant`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        username: env.BKASH_USERNAME,
        password: env.BKASH_PASSWORD,
      },
      body: JSON.stringify({
        app_key: env.BKASH_APP_KEY,
        app_secret: env.BKASH_APP_SECRET,
      }),
    },
  );

  const body = (await res.json()) as {
    id_token?: string;
    expires_in?: number;
    statusMessage?: string;
  };

  if (!res.ok || !body.id_token) {
    throw new Error(
      `bKash token grant failed: ${body.statusMessage ?? res.statusText}`,
    );
  }

  const ttlMs = (body.expires_in ?? 3600) * 1000;
  cachedToken = {
    value: body.id_token,
    expiresAt: Date.now() + ttlMs - 60_000,
  };
  return cachedToken.value;
};

const authHeaders = (token: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  authorization: token,
  'x-app-key': env.BKASH_APP_KEY,
});

/**
 * Creates a bKash payment for an order and returns the paymentID plus the URL
 * the browser must be redirected to. `orderId` is used as the merchant invoice
 * number so a bKash transaction can be traced back to an order.
 */
export const createBkashPayment = async (
  amountMinorUnits: number,
  orderId: string,
): Promise<BkashCreateResult> => {
  if (env.BKASH_MOCK) {
    const paymentID = `MOCK-${orderId}`;
    return {
      providerRef: paymentID,
      bkashURL: `${env.APP_URL}${env.API_PREFIX}/payments/bkash/callback?paymentID=${paymentID}&status=success`,
    };
  }

  const token = await grantToken();
  const res = await fetch(`${env.BKASH_BASE_URL}/tokenized/checkout/create`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      mode: '0011',
      payerReference: orderId,
      callbackURL: env.BKASH_CALLBACK_URL,
      amount: toMajorUnits(amountMinorUnits),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: orderId,
    }),
  });

  const body = (await res.json()) as {
    paymentID?: string;
    bkashURL?: string;
    statusMessage?: string;
  };

  if (!res.ok || !body.paymentID || !body.bkashURL) {
    throw new Error(
      `bKash create payment failed: ${body.statusMessage ?? res.statusText}`,
    );
  }

  return { providerRef: body.paymentID, bkashURL: body.bkashURL };
};

/**
 * Executes a previously created payment and reports the final outcome. Called
 * from the callback once the buyer has authorised (or declined) in the bKash
 * app. A `transactionStatus` of "Completed" is the only success.
 */
export const executeBkashPayment = async (
  paymentID: string,
): Promise<BkashExecuteResult> => {
  if (env.BKASH_MOCK) {
    return {
      success: true,
      trxID: `MOCK-TRX-${paymentID}`,
      raw: { transactionStatus: 'Completed', paymentID },
    };
  }

  const token = await grantToken();
  const res = await fetch(`${env.BKASH_BASE_URL}/tokenized/checkout/execute`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ paymentID }),
  });

  const body = (await res.json()) as {
    transactionStatus?: string;
    trxID?: string;
    statusMessage?: string;
  };

  const success = res.ok && body.transactionStatus === 'Completed';
  return { success, trxID: body.trxID, raw: body };
};
