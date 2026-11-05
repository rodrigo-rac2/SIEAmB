import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { handleMercadoPagoWebhook, type WebhookDeps } from './webhook';

const SECRET = 'c'.repeat(64);
const TOKEN = 'APP_USR-test-token';
const ORDER_ID = 'ORDTST01M6PCN643FNC0HP9DMKKVM8XR';
const ENV = { accessToken: TOKEN, webhookSecret: SECRET };
const ENDPOINT = 'https://dev.sieamb.org/api/v1/payments/webhook/mercadopago';

interface NotificationOptions {
  method?: string;
  dataId?: string | null;
  requestId?: string | null;
  secret?: string;
  signature?: string | null;
  body?: unknown;
  rawBody?: string;
}

function notification(options: NotificationOptions = {}): Request {
  const {
    method = 'POST',
    dataId = ORDER_ID,
    requestId = 'req-123',
    secret = SECRET,
    body = { type: 'order', action: 'order.processed', live_mode: false, data: { id: ORDER_ID } },
  } = options;
  const ts = '1704908010';
  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  const signature = options.signature === undefined ? `ts=${ts},v1=${v1}` : options.signature;

  const headers = new Headers({ 'content-type': 'application/json' });
  if (requestId) headers.set('x-request-id', requestId);
  if (signature) headers.set('x-signature', signature);
  const url = new URL(ENDPOINT);
  if (dataId) url.searchParams.set('data.id', dataId);
  url.searchParams.set('type', 'order');
  return new Request(url, {
    method,
    headers,
    body: method === 'POST' ? (options.rawBody ?? JSON.stringify(body)) : undefined,
  });
}

function deps(response?: Response) {
  const fetchMock = vi.fn(async () =>
    (
      response ??
      new Response(
        JSON.stringify({
          id: ORDER_ID,
          status: 'processed',
          status_detail: 'accredited',
          external_reference: 'reg-1',
          total_amount: '30.00',
          payer: { email: 'someone@example.com' },
        }),
        { status: 200 },
      )
    ).clone(),
  );
  const log = vi.fn();
  return { fetch: fetchMock as unknown as typeof fetch, log, fetchMock } satisfies WebhookDeps & {
    fetchMock: typeof fetchMock;
  };
}

describe('handleMercadoPagoWebhook', () => {
  it('answers 405 to anything but POST', async () => {
    const d = deps();
    const response = await handleMercadoPagoWebhook(notification({ method: 'GET' }), ENV, d);
    expect(response.status).toBe(405);
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no access token', { webhookSecret: SECRET }],
    ['no webhook secret', { accessToken: TOKEN }],
    ['empty values', { accessToken: '', webhookSecret: '' }],
  ])('answers 503 with %s, even for a well-signed notification', async (_name, env) => {
    const d = deps();
    const response = await handleMercadoPagoWebhook(notification(), env, d);
    expect(response.status).toBe(503);
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no signature header', { signature: null }],
    ['a malformed signature header', { signature: 'ts=1,v1=nope' }],
    ['a digest made with another secret', { secret: 'd'.repeat(64) }],
  ])('answers 401 to %s and never calls Mercado Pago', async (_name, options) => {
    const d = deps();
    const response = await handleMercadoPagoWebhook(notification(options), ENV, d);
    expect(response.status).toBe(401);
    expect(d.fetchMock).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith('mp_webhook_rejected', expect.any(Object));
  });

  it('answers 401 when a valid signature is replayed with another order id', async () => {
    const d = deps();
    const signed = notification();
    const replay = new URL(signed.url);
    replay.searchParams.set('data.id', 'ORDTST01ZZZZZZZZZZZZZZZZZZZZZZZZ');
    const response = await handleMercadoPagoWebhook(
      new Request(replay, { method: 'POST', headers: signed.headers, body: '{}' }),
      ENV,
      d,
    );
    expect(response.status).toBe(401);
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it('never logs the secret or the access token', async () => {
    const d = deps();
    await handleMercadoPagoWebhook(notification({ secret: 'd'.repeat(64) }), ENV, d);
    await handleMercadoPagoWebhook(notification(), ENV, d);
    const logged = JSON.stringify(d.log.mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('someone@example.com');
  });

  it('reads the order back from Mercado Pago with the access token and logs its status', async () => {
    const d = deps();
    const response = await handleMercadoPagoWebhook(notification(), ENV, d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, handled: true });
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = d.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.mercadopago.com/v1/orders/${ORDER_ID}`);
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(d.log).toHaveBeenCalledWith(
      'mp_webhook_order',
      expect.objectContaining({
        orderId: ORDER_ID,
        status: 'processed',
        statusDetail: 'accredited',
        externalReference: 'reg-1',
        liveMode: false,
      }),
    );
  });

  it('takes the status from Mercado Pago, not from the notification body', async () => {
    const d = deps(
      new Response(JSON.stringify({ id: ORDER_ID, status: 'failed', status_detail: 'high_risk' }), {
        status: 200,
      }),
    );
    const forged = {
      type: 'order',
      action: 'order.processed',
      data: { id: ORDER_ID, status: 'processed' },
    };
    await handleMercadoPagoWebhook(notification({ body: forged }), ENV, d);
    expect(d.log).toHaveBeenCalledWith(
      'mp_webhook_order',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('acknowledges other topics without calling Mercado Pago', async () => {
    const d = deps();
    const response = await handleMercadoPagoWebhook(
      notification({ dataId: '123456', body: { type: 'payment', data: { id: '123456' } } }),
      ENV,
      d,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, handled: false });
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it('does not put a signed but hostile id into the Mercado Pago URL', async () => {
    const d = deps();
    const response = await handleMercadoPagoWebhook(
      notification({ dataId: 'ORD/../../users/me', body: { type: 'order' } }),
      ENV,
      d,
    );
    expect(response.status).toBe(200);
    expect(d.fetchMock).not.toHaveBeenCalled();
  });

  it('survives a body that is not JSON, using the id and type from the URL', async () => {
    const d = deps();
    const response = await handleMercadoPagoWebhook(notification({ rawBody: 'not json' }), ENV, d);
    expect(response.status).toBe(200);
    expect(d.fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Mercado Pago answers 500', new Response('oops', { status: 500 })],
    ['Mercado Pago answers 404', new Response('{}', { status: 404 })],
    ['the order has no status', new Response(JSON.stringify({ id: ORDER_ID }), { status: 200 })],
  ])('answers 502 so Mercado Pago retries when %s', async (_name, upstream) => {
    const d = deps(upstream);
    const response = await handleMercadoPagoWebhook(notification(), ENV, d);
    expect(response.status).toBe(502);
    expect(d.log).toHaveBeenCalledWith('mp_webhook_lookup_failed', expect.any(Object));
  });

  it('answers 502 when the call to Mercado Pago throws', async () => {
    const d = deps();
    d.fetchMock.mockRejectedValueOnce(new Error('network down'));
    const response = await handleMercadoPagoWebhook(notification(), ENV, d);
    expect(response.status).toBe(502);
  });
});
