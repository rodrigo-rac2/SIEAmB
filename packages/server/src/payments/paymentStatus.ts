import { json, type Log } from './http';
import { fetchOrder } from './mercadoPago';
import { OPEN_STATUSES } from './status';
import { isUuid, type PaymentStore } from './store';
import { applyOrderToPayment } from './sync';

export interface StatusEnv {
  accessToken?: string;
  now: Date;
}

export interface StatusDeps {
  fetch: typeof fetch;
  store?: PaymentStore;
  log: Log;
}

/**
 * `GET /api/v1/payments/status?p=<payment id>` for the return page (#160).
 *
 * The payment id is an unguessable uuid and the answer carries no personal data.
 * While the payment is still open the order is re-read from Mercado Pago, so the
 * page does not depend on the notification having arrived first.
 */
export async function handlePaymentStatus(
  request: Request,
  env: StatusEnv,
  deps: StatusDeps,
): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' });
  const { accessToken } = env;
  const { store } = deps;
  if (!accessToken || !store) return json(503, { error: 'payments_not_configured' });

  const id = new URL(request.url).searchParams.get('p');
  if (!isUuid(id)) return json(400, { error: 'invalid_payment_id' });

  let payment = await store.findPaymentById(id);
  if (!payment) return json(404, { error: 'payment_not_found' });

  if (OPEN_STATUSES.includes(payment.status) && payment.mpOrderId) {
    try {
      const order = await fetchOrder(payment.mpOrderId, accessToken, deps.fetch);
      payment = await applyOrderToPayment(payment, order, store, env.now);
    } catch {
      // Mercado Pago unreachable: answer with what we have, the notification will catch up.
      deps.log('mp_status_refresh_failed', { paymentId: payment.id });
    }
  }
  return json(200, { status: payment.status, amountCents: payment.amountCents });
}
