import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FakeStore, NOW, ORDER_ID, TOKEN, answer, mercadoPago, order } from './testing';
import { createPaymentNotifier, type OutgoingMail } from './notifications';
import { handlePaymentStatus } from './paymentStatus';
import { handleMercadoPagoWebhook } from './webhook';

const SECRET = 'c'.repeat(64);
const ENV = { accessToken: TOKEN, webhookSecret: SECRET, now: NOW };
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

function setup(...responses: (Response | Error)[]) {
  const store = new FakeStore();
  const fetchMock = mercadoPago(...responses);
  const log = vi.fn();
  return {
    store,
    fetchMock,
    log,
    deps: { fetch: fetchMock as unknown as typeof fetch, store, log },
  };
}

describe('handleMercadoPagoWebhook: who may call it', () => {
  it('answers 405 to anything but POST', async () => {
    const { deps, fetchMock } = setup();
    const response = await handleMercadoPagoWebhook(notification({ method: 'GET' }), ENV, deps);
    expect(response.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no access token', { webhookSecret: SECRET, now: NOW }],
    ['no webhook secret', { accessToken: TOKEN, now: NOW }],
    ['empty values', { accessToken: '', webhookSecret: '', now: NOW }],
  ])('answers 503 with %s, even for a well-signed notification', async (_name, env) => {
    const { deps, fetchMock } = setup();
    const response = await handleMercadoPagoWebhook(notification(), env, deps);
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 without a database, so Mercado Pago retries instead of losing the payment', async () => {
    const { deps, fetchMock } = setup();
    const response = await handleMercadoPagoWebhook(notification(), ENV, {
      ...deps,
      store: undefined,
    });
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no signature header', { signature: null }],
    ['a malformed signature header', { signature: 'ts=1,v1=nope' }],
    ['a digest made with another secret', { secret: 'd'.repeat(64) }],
  ])('answers 401 to %s and touches nothing', async (_name, options) => {
    const { deps, fetchMock, store, log } = setup();
    const payment = store.seed({ mpOrderId: ORDER_ID });
    const response = await handleMercadoPagoWebhook(notification(options), ENV, deps);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.payments[0]).toEqual(payment);
    expect(log).toHaveBeenCalledWith('mp_webhook_rejected', expect.any(Object));
  });

  it('answers 401 when a valid signature is replayed with another order id', async () => {
    const { deps, fetchMock } = setup();
    const signed = notification();
    const replay = new URL(signed.url);
    replay.searchParams.set('data.id', 'ORDTST01ZZZZZZZZZZZZZZZZZZZZZZZZ');
    const response = await handleMercadoPagoWebhook(
      new Request(replay, { method: 'POST', headers: signed.headers, body: '{}' }),
      ENV,
      deps,
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('handleMercadoPagoWebhook: recording the payment', () => {
  it('marks our payment approved from the order read back from Mercado Pago', async () => {
    const { deps, fetchMock, store, log } = setup();
    const payment = store.seed({ mpOrderId: ORDER_ID });
    const response = await handleMercadoPagoWebhook(notification(), ENV, deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, handled: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://api.mercadopago.com/v1/orders/${ORDER_ID}`);
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(store.payments[0]).toMatchObject({
      id: payment.id,
      status: 'APPROVED',
      mpStatus: 'processed',
      mpStatusDetail: 'accredited',
      paidAt: NOW.toISOString(),
    });
    expect(log).toHaveBeenCalledWith(
      'mp_webhook_order',
      expect.objectContaining({ paymentId: payment.id, paymentStatus: 'APPROVED' }),
    );
  });

  it('takes the status from Mercado Pago, not from the notification body', async () => {
    const { deps, store } = setup(answer(order({ status: 'failed', status_detail: 'high_risk' })));
    store.seed({ mpOrderId: ORDER_ID });
    const forged = {
      type: 'order',
      action: 'order.processed',
      data: { id: ORDER_ID, status: 'processed' },
    };
    await handleMercadoPagoWebhook(notification({ body: forged }), ENV, deps);
    expect(store.payments[0]).toMatchObject({ status: 'REJECTED', paidAt: null });
  });

  it('keeps the first approval date when the same notification arrives again', async () => {
    const { deps, store } = setup();
    store.seed({ mpOrderId: ORDER_ID });
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    const later = { ...ENV, now: new Date(NOW.getTime() + 3_600_000) };
    const response = await handleMercadoPagoWebhook(notification(), later, deps);
    expect(response.status).toBe(200);
    expect(store.payments[0]).toMatchObject({ status: 'APPROVED', paidAt: NOW.toISOString() });
  });

  it('records a refund on a payment that was approved', async () => {
    const { deps, store } = setup(answer(order({ status: 'refunded', status_detail: 'refunded' })));
    store.seed({ mpOrderId: ORDER_ID, status: 'APPROVED', paidAt: NOW.toISOString() });
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(store.payments[0]).toMatchObject({ status: 'REFUNDED', paidAt: NOW.toISOString() });
  });

  it('does not change our status for a Mercado Pago status it does not know', async () => {
    const { deps, store } = setup(answer(order({ status: 'under_dispute', status_detail: 'x' })));
    store.seed({ mpOrderId: ORDER_ID, status: 'APPROVED', paidAt: NOW.toISOString() });
    const response = await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(response.status).toBe(200);
    expect(store.payments[0]).toMatchObject({ status: 'APPROVED', mpStatus: 'under_dispute' });
  });

  it('finds a payment whose order id was never saved, through the external reference', async () => {
    const { deps, store } = setup();
    const payment = store.seed({ mpOrderId: null });
    fetchMockAnswer(deps, order({ external_reference: payment.id }));
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(store.payments[0]).toMatchObject({ status: 'APPROVED', mpOrderId: ORDER_ID });
  });

  it('does not let an order claim, by reference, a payment that belongs to another order', async () => {
    const { deps, store } = setup();
    const payment = store.seed({ mpOrderId: 'ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA' });
    fetchMockAnswer(deps, order({ external_reference: payment.id }));
    const response = await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(await response.json()).toEqual({ received: true, handled: false });
    expect(store.payments[0]).toMatchObject({ status: 'CREATED', paidAt: null });
  });

  it('acknowledges an order that is not ours without failing', async () => {
    const { deps, log } = setup();
    const response = await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, handled: false });
    expect(log).toHaveBeenCalledWith('mp_webhook_unknown_order', expect.any(Object));
  });

  it('stores a snapshot without payer data and never logs secrets or e-mails', async () => {
    const { deps, store, log } = setup();
    const payment = store.seed({ mpOrderId: ORDER_ID });
    await handleMercadoPagoWebhook(notification({ secret: 'd'.repeat(64) }), ENV, deps);
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    const kept = JSON.stringify([log.mock.calls, store.snapshots.get(payment.id)]);
    expect(kept).not.toContain(SECRET);
    expect(kept).not.toContain(TOKEN);
    expect(kept).not.toContain('someone@example.com');
    expect(store.snapshots.get(payment.id)).toMatchObject({
      status: 'processed',
      payments: [{ method: 'master', type: 'credit_card', installments: 1 }],
    });
  });
});

describe('handleMercadoPagoWebhook: what it ignores or retries', () => {
  it('acknowledges other topics without calling Mercado Pago', async () => {
    const { deps, fetchMock } = setup();
    const response = await handleMercadoPagoWebhook(
      notification({ dataId: '123456', body: { type: 'payment', data: { id: '123456' } } }),
      ENV,
      deps,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, handled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not put a signed but hostile id into the Mercado Pago URL', async () => {
    const { deps, fetchMock } = setup();
    const response = await handleMercadoPagoWebhook(
      notification({ dataId: 'ORD/../../users/me', body: { type: 'order' } }),
      ENV,
      deps,
    );
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['is not JSON', 'not json'],
    ['is a JSON array', '[1,2]'],
    ['is JSON null', 'null'],
  ])('survives a body that %s, using the id and type from the URL', async (_name, rawBody) => {
    const { deps, fetchMock, store } = setup();
    store.seed({ mpOrderId: ORDER_ID });
    const response = await handleMercadoPagoWebhook(notification({ rawBody }), ENV, deps);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.payments[0]!.status).toBe('APPROVED');
  });

  it.each([
    ['Mercado Pago answers 500', new Response('oops', { status: 500 })],
    ['Mercado Pago answers 404', new Response('{}', { status: 404 })],
    ['the order has no status', answer({ id: ORDER_ID })],
    ['the call to Mercado Pago throws', new Error('network down')],
  ])('answers 502 so Mercado Pago retries when %s', async (_name, upstream) => {
    const { deps, store, log } = setup(upstream);
    store.seed({ mpOrderId: ORDER_ID });
    const response = await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(response.status).toBe(502);
    expect(store.payments[0]!.status).toBe('CREATED');
    expect(log).toHaveBeenCalledWith('mp_webhook_failed', expect.any(Object));
  });

  it('answers 502 when the database write fails, so the approval is not lost', async () => {
    const { deps, store } = setup();
    store.seed({ mpOrderId: ORDER_ID });
    store.failNextUpdate = true;
    const response = await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(response.status).toBe(502);
    // The retry then succeeds.
    const retry = await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(retry.status).toBe(200);
    expect(store.payments[0]!.status).toBe('APPROVED');
  });
});

function fetchMockAnswer(deps: { fetch: typeof fetch }, body: unknown) {
  (deps.fetch as unknown as ReturnType<typeof mercadoPago>).mockImplementation(async () =>
    answer(body),
  );
}

describe('handleMercadoPagoWebhook: telling the person (#185)', () => {
  function withEmails(responses: (Response | Error)[], failSends = 0) {
    const base = setup(...responses);
    const sent: OutgoingMail[] = [];
    let failures = failSends;
    const mailer = {
      send: async (mail: OutgoingMail) => {
        if (failures > 0) {
          failures -= 1;
          throw new Error('smtp down');
        }
        sent.push(mail);
      },
    };
    const notify = createPaymentNotifier(
      { store: base.store, mailer, siteUrl: 'https://sieamb.org', log: base.log },
      () => NOW,
    );
    return { ...base, sent, deps: { ...base.deps, notify } };
  }

  it('e-mails "payment confirmed" once, however many times the approval is notified', async () => {
    const { deps, store, sent } = withEmails([]);
    store.seed({ mpOrderId: ORDER_ID });
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(sent.map((m) => m.subject)).toEqual(['Inscrição concluída: pagamento confirmado (II SIEAmB)']);
  });

  it('e-mails "we are processing your payment" for a card Mercado Pago is reviewing, then "confirmed"', async () => {
    const { deps, store, sent } = withEmails([
      answer(order({ status: 'in_review', status_detail: 'pending_review_manual' })),
      answer(order()),
    ]);
    store.seed({ mpOrderId: ORDER_ID });
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(store.payments[0]!.status).toBe('PENDING');
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(sent.map((m) => m.subject)).toEqual([
      'Inscrição recebida: estamos processando seu pagamento (II SIEAmB)',
      'Inscrição concluída: pagamento confirmado (II SIEAmB)',
    ]);
  });

  it('e-mails "payment not approved" when the order fails', async () => {
    const { deps, store, sent } = withEmails([answer(order({ status: 'failed', status_detail: 'rejected' }))]);
    store.seed({ mpOrderId: ORDER_ID });
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(sent.map((m) => m.subject)).toEqual(['Pagamento não aprovado (II SIEAmB)']);
  });

  it('still answers 200 and records the approval when the mail server is down', async () => {
    const { deps, store, sent } = withEmails([], 1);
    store.seed({ mpOrderId: ORDER_ID });
    const response = await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(response.status).toBe(200);
    expect(store.payments[0]!.status).toBe('APPROVED');
    expect(sent).toHaveLength(0);
    expect(store.emails[0]).toMatchObject({ kind: 'CONFIRMED', status: 'PENDING' });
  });

  it('the return page and the notification seeing the same approval send one e-mail', async () => {
    const { deps, store, sent } = withEmails([]);
    const payment = store.seed({ mpOrderId: ORDER_ID });
    const statusRequest = new Request(`https://sieamb.org/api/v1/payments/status?p=${payment.id}`);
    await Promise.all([
      handleMercadoPagoWebhook(notification(), ENV, deps),
      handlePaymentStatus(statusRequest, { accessToken: TOKEN, now: NOW }, deps),
    ]);
    expect(store.payments[0]!.status).toBe('APPROVED');
    expect(sent).toHaveLength(1);
  });

  it('sends nothing for an order status it does not know', async () => {
    const { deps, store, sent } = withEmails([answer(order({ status: 'something_new', status_detail: 'x' }))]);
    store.seed({ mpOrderId: ORDER_ID });
    await handleMercadoPagoWebhook(notification(), ENV, deps);
    expect(sent).toHaveLength(0);
    expect(store.emails).toHaveLength(0);
  });
});
