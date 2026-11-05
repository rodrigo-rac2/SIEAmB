import { MercadoPagoError, fetchOrder, isOrderId } from './mercadoPago';
import { parseSignatureHeader, verifySignature } from './signature';

export interface WebhookEnv {
  accessToken?: string;
  webhookSecret?: string;
}

export interface WebhookDeps {
  fetch: typeof fetch;
  /** Structured log line. Never pass secrets or payer data. */
  log: (event: string, data: Record<string, unknown>) => void;
}

interface NotificationBody {
  type?: unknown;
  action?: unknown;
  live_mode?: unknown;
  data?: { id?: unknown };
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function readBody(request: Request): Promise<NotificationBody> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as NotificationBody) : {};
  } catch {
    return {};
  }
}

/**
 * Mercado Pago "Order" notifications (#158).
 *
 * 1. Refuse anything whose `x-signature` does not match our secret.
 * 2. Acknowledge, without acting, topics we do not handle.
 * 3. Read the order back from Mercado Pago and log its status.
 *
 * Persisting the payment comes with the payments table. A non-2xx answer makes
 * Mercado Pago retry, so only failures worth a retry answer with one.
 */
export async function handleMercadoPagoWebhook(
  request: Request,
  env: WebhookEnv,
  deps: WebhookDeps,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!env.accessToken || !env.webhookSecret)
    return json(503, { error: 'payments_not_configured' });

  const url = new URL(request.url);
  const queryId = url.searchParams.get('data.id');
  const requestId = request.headers.get('x-request-id');
  const signature = parseSignatureHeader(request.headers.get('x-signature'));
  const body = await readBody(request);
  const type = typeof body.type === 'string' ? body.type : url.searchParams.get('type');
  const action = typeof body.action === 'string' ? body.action : null;

  if (!signature) {
    deps.log('mp_webhook_rejected', { reason: 'missing_or_malformed_signature', requestId });
    return json(401, { error: 'invalid_signature' });
  }
  if (!verifySignature(signature, { dataId: queryId, requestId }, env.webhookSecret)) {
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

  const orderId = queryId ?? (typeof body.data?.id === 'string' ? body.data.id : null);
  if (type !== 'order' || !isOrderId(orderId)) {
    deps.log('mp_webhook_ignored', { type, action, requestId, hasOrderId: isOrderId(orderId) });
    return json(200, { received: true, handled: false });
  }

  try {
    const order = await fetchOrder(orderId, env.accessToken, deps.fetch);
    deps.log('mp_webhook_order', {
      orderId: order.id,
      status: order.status,
      statusDetail: order.status_detail ?? null,
      externalReference: order.external_reference ?? null,
      totalAmount: order.total_amount ?? null,
      action,
      liveMode: body.live_mode === true,
      requestId,
    });
    return json(200, { received: true, handled: true });
  } catch (error) {
    const status = error instanceof MercadoPagoError ? error.status : 0;
    deps.log('mp_webhook_lookup_failed', { orderId, status, requestId });
    return json(502, { error: 'order_lookup_failed' });
  }
}
