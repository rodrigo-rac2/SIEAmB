/**
 * Browser side of the payment path (#16). Talks to the Vercel functions under
 * /api/v1/payments; the price and the payment status are always decided there.
 */

export type PaymentStatus =
  'CREATED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED';

const STATUSES: readonly string[] = [
  'CREATED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'REFUNDED',
];

export interface StartedPayment {
  paymentId: string;
  checkoutUrl: string;
  amountCents: number;
}

export interface PaymentState {
  status: PaymentStatus;
  amountCents: number;
}

/** Error codes the screens have a text for; anything else is shown as `generic`. */
export type PaymentErrorCode =
  | 'already_paid'
  | 'no_fee_available'
  | 'payment_pending'
  | 'registration_not_found'
  | 'payment_not_found'
  | 'generic';

const KNOWN_ERRORS: readonly string[] = [
  'already_paid',
  'no_fee_available',
  'payment_pending',
  'registration_not_found',
  'payment_not_found',
];

export class PaymentError extends Error {
  constructor(readonly code: PaymentErrorCode) {
    super(code);
    this.name = 'PaymentError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

/** Payments are switched on per deployment; off means the form behaves as before #160. */
export const paymentsEnabled = (): boolean => import.meta.env.VITE_PAYMENTS_ENABLED === 'true';

/** Only ever send people to Mercado Pago over https, whatever the server answered. */
export function isCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      /(^|\.)mercadopago\.(com|com\.br|com\.ar|com\.mx|cl|com\.co|com\.pe|com\.uy)$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

async function errorFrom(response: Response): Promise<PaymentError> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  const code =
    typeof body.error === 'string' && KNOWN_ERRORS.includes(body.error) ? body.error : 'generic';
  return new PaymentError(code as PaymentErrorCode);
}

/** Starts, or resumes, the payment of a pre-registration and returns where to send the person. */
export async function startPayment(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StartedPayment> {
  let response: Response;
  try {
    response = await fetchImpl('/api/v1/payments/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new PaymentError('generic');
  }
  if (!response.ok) throw await errorFrom(response);
  const body = (await response.json().catch(() => ({}))) as Partial<StartedPayment>;
  if (!isUuid(body.paymentId) || !isCheckoutUrl(body.checkoutUrl))
    throw new PaymentError('generic');
  return {
    paymentId: body.paymentId,
    checkoutUrl: body.checkoutUrl,
    amountCents: typeof body.amountCents === 'number' ? body.amountCents : 0,
  };
}

export async function getPaymentStatus(
  paymentId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PaymentState> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/v1/payments/status?p=${encodeURIComponent(paymentId)}`);
  } catch {
    throw new PaymentError('generic');
  }
  if (!response.ok) throw await errorFrom(response);
  const body = (await response.json().catch(() => ({}))) as Partial<PaymentState>;
  if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) {
    throw new PaymentError('generic');
  }
  return {
    status: body.status,
    amountCents: typeof body.amountCents === 'number' ? body.amountCents : 0,
  };
}

const TOKEN_KEY = 'sieamb-pay-token';

/** Remembered for this tab only, so the return page can offer "try again". */
export function rememberPayToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private mode or blocked storage: the retry link is simply not offered.
  }
}

export function recallPayToken(): string | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    return isUuid(token) ? token : null;
  } catch {
    return null;
  }
}

/** 5000 → "R$ 50,00" in the reader's locale. */
export function formatBRL(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
