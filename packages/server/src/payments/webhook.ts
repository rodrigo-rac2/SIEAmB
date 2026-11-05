import { json, readJsonObject, type Log } from './http';
import { MercadoPagoError, fetchOrder, isOrderId } from './mercadoPago';
import { parseSignatureHeader, verifySignature } from './signature';
import { isUuid, type PaymentStore } from './store';
import { applyOrderToPayment } from './sync';

export interface WebhookEnv {
  accessToken?: string;
  webhookSecret?: string;
  now: Date;
}

export interface WebhookDeps {
  fetch: typeof fetch;
  store?: PaymentStore;
  log: Log;
}

/**
 * Mercado Pago "Order" notifications (#158, #160).
 *
 * 1. Refuse anything whose `x-signature` does not match our secret.
 * 2. Acknowledge, without acting, topics we do not handle.
 * 3. Read the order back from Mercado Pago and record its status on our payment.
 *
 * A non-2xx answer makes Mercado Pago retry, so only failures worth a retry
 * answer with one.
 */
export async function handleMercadoPagoWebhook(
  request: Request,
  env: WebhookEnv,
  deps: WebhookDeps,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { accessToken, webhookSecret } = env;
  const { store } = deps;
  if (!accessToken || !webhookSecret || !store) {
    return json(503, { error: 'payments_not_configured' });
  }

  const url = new URL(request.url);
  const queryId = url.searchParams.get('data.id');
  const requestId = request.headers.get('x-request-id');
  const signature = parseSignatureHeader(request.headers.get('x-signature'));
  const body = await readJsonObject(request);
  const type = typeof body.type === 'string' ? body.type : url.searchParams.get('type');
  const action = typeof body.action === 'string' ? body.action : null;
  const bodyData =
    body.data && typeof body.data === 'object' ? (body.data as { id?: unknown }) : {};

  if (!signature) {
    deps.log('mp_webhook_rejected', { reason: 'missing_or_malformed_signature', requestId });
    return json(401, { error: 'invalid_signature' });
  }
  if (!verifySignature(signature, { dataId: queryId, requestId }, webhookSecret)) {
    // Nothing here is secret: the digest only proves knowledge of the secret for these exact values.
    deps.log('mp_webhook_rejected', {
      reason: 'signature_mismatch',
      requestId,
      ts: signature.ts,
      v1: signature.v1,
      queryId,
      type,
      action,
    });
    return json(401, { error: 'invalid_signature' });
  }

  const orderId = queryId ?? (typeof bodyData.id === 'string' ? bodyData.id : null);
  if (type !== 'order' || !isOrderId(orderId)) {
    deps.log('mp_webhook_ignored', { type, action, requestId, hasOrderId: isOrderId(orderId) });
    return json(200, { received: true, handled: false });
  }

  try {
    const order = await fetchOrder(orderId, accessToken, deps.fetch);
    const logged = {
      orderId: order.id,
      status: order.status,
      statusDetail: order.status_detail ?? null,
      action,
      liveMode: body.live_mode === true,
      requestId,
    };

    let payment = await store.findPaymentByOrderId(order.id);
    if (!payment && isUuid(order.external_reference)) {
      // The order exists but our row never got its id (the answer to its creation was lost).
      const byReference = await store.findPaymentById(order.external_reference);
      if (byReference && !byReference.mpOrderId) payment = byReference;
    }
    if (!payment) {
      deps.log('mp_webhook_unknown_order', logged);
      return json(200, { received: true, handled: false });
    }

    const updated = await applyOrderToPayment(payment, order, store, env.now);
    deps.log('mp_webhook_order', {
      ...logged,
      paymentId: updated.id,
      paymentStatus: updated.status,
    });
    return json(200, { received: true, handled: true });
  } catch (error) {
    const status = error instanceof MercadoPagoError ? error.status : 0;
    deps.log('mp_webhook_failed', {
      orderId,
      status,
      requestId,
      reason: error instanceof MercadoPagoError ? error.message : 'store_or_network',
    });
    return json(502, { error: 'order_processing_failed' });
  }
}
