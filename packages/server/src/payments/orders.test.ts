import { describe, expect, it, vi } from 'vitest';
import { handleCreateOrder } from './orders';
import {
  FakeStore,
  NOW,
  ORDER_ID,
  PAY_TOKEN,
  REGISTRATION,
  TOKEN,
  answer,
  mercadoPago,
  order,
} from './testing';

const ENDPOINT = 'https://dev.sieamb.org/api/v1/payments/orders';
const ENV = { accessToken: TOKEN, now: NOW };
const CHECKOUT = `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${ORDER_ID}`;
const created = () =>
  answer(order({ status: 'created', status_detail: null, checkout_url: CHECKOUT }), 201);

const post = (body: unknown, init: RequestInit = {}) =>
  new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

function setup(...responses: (Response | Error)[]) {
  const store = new FakeStore();
  const fetchMock = mercadoPago(...(responses.length ? responses : [created()]));
  const log = vi.fn();
  return {
    store,
    fetchMock,
    log,
    deps: { fetch: fetchMock as unknown as typeof fetch, store, log },
  };
}

const sentOrder = (fetchMock: ReturnType<typeof mercadoPago>, call = 0) => {
  const [url, init] = fetchMock.mock.calls[call]!;
  return { url, init, body: JSON.parse(String(init?.body)) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

describe('handleCreateOrder: refusing bad requests', () => {
  it('answers 405 to GET', async () => {
    const { deps } = setup();
    const response = await handleCreateOrder(new Request(ENDPOINT), ENV, deps);
    expect(response.status).toBe(405);
  });

  it.each([
    ['no access token', { now: NOW }, {}],
    ['no database', ENV, { store: undefined }],
  ])('answers 503 with %s', async (_name, env, override) => {
    const { deps, fetchMock } = setup();
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), env, {
      ...deps,
      ...override,
    });
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', ''],
    ['invalid JSON', '{token:'],
    ['no token', {}],
    ['a number', { token: 42 }],
    ['an e-mail instead of a token', { token: 'pessoa@example.com' }],
    ['a token with a filter appended', { token: `${PAY_TOKEN}&select=*` }],
    ['an array', [PAY_TOKEN]],
  ])('answers 400 to %s without touching the database', async (_name, body) => {
    const { deps, store, fetchMock } = setup();
    const find = vi.spyOn(store, 'findPreRegistrationByToken');
    const response = await handleCreateOrder(post(body), ENV, deps);
    expect(response.status).toBe(400);
    expect(find).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 404 to a well-formed token nobody has', async () => {
    const { deps, fetchMock } = setup();
    const response = await handleCreateOrder(
      post({ token: '3f2b8c1e-9a4d-4e7f-8b21-000000000000' }),
      ENV,
      deps,
    );
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('handleCreateOrder: creating the order', () => {
  it('charges the fee from the server table, whatever the browser sends', async () => {
    const { deps, store, fetchMock } = setup();
    const response = await handleCreateOrder(
      post({ token: PAY_TOKEN, amountCents: 1, amount: '0.01', category: 'ESTUDANTE_GRADUACAO' }),
      ENV,
      deps,
    );
    expect(response.status).toBe(201);
    const payment = store.payments[0]!;
    // ESTUDANTE_POS, lot 1, on 12 Nov 2026 is R$ 50,00 in the fee table the site ships.
    expect(payment).toMatchObject({
      amountCents: 5000,
      feeTierRef: 'f2',
      status: 'CREATED',
      mpOrderId: ORDER_ID,
    });
    expect(await response.json()).toEqual({
      paymentId: payment.id,
      checkoutUrl: CHECKOUT,
      amountCents: 5000,
    });

    const { url, init, body } = sentOrder(fetchMock);
    expect(url).toBe('https://api.mercadopago.com/v1/orders');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(headers.get('x-idempotency-key')).toBe(payment.id);
    expect(body).toMatchObject({
      type: 'online',
      processing_mode: 'manual',
      total_amount: '50.00',
      external_reference: payment.id,
      payer: { email: REGISTRATION.email },
      items: [{ unit_price: '50.00', quantity: 1 }],
    });
    const returnUrl = `https://dev.sieamb.org/2027/inscricoes/pagamento?p=${payment.id}`;
    expect(body.config.online).toEqual({
      success_url: returnUrl,
      failure_url: returnUrl,
      pending_url: returnUrl,
    });
  });

  it('gives the same open order back on a second click, without a second Mercado Pago order', async () => {
    const { deps, store, fetchMock } = setup();
    const first = await (await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps)).json();
    const second = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(first);
    expect(store.payments).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps reusing a fresh order when the fee clock is moved days ahead for testing', async () => {
    const { deps, store, fetchMock } = setup();
    // Real time is 5 Nov, before lot 1; the override picks the lot as if it were 12 Nov.
    const env = { accessToken: TOKEN, now: new Date('2026-11-05T20:00:00-03:00'), feeNow: NOW };
    const first = await handleCreateOrder(post({ token: PAY_TOKEN }), env, deps);
    expect(first.status).toBe(201);
    store.payments[0]!.createdAt = env.now.toISOString();
    const second = await handleCreateOrder(post({ token: PAY_TOKEN }), env, deps);
    expect(second.status).toBe(200);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]!.status).toBe('CREATED');
    // One call to create the order, none to look it up or cancel it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers 409 when the registration is already paid', async () => {
    const { deps, store, fetchMock } = setup();
    store.seed({ status: 'APPROVED', mpOrderId: ORDER_ID, paidAt: NOW.toISOString() });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'already_paid' });
    expect(store.payments).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens a new order after a rejected one', async () => {
    const { deps, store } = setup();
    store.seed({ status: 'REJECTED', mpOrderId: 'ORDTST01AAAAAAAAAAAAAAAAAAAAAAAA' });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(201);
    expect(store.payments).toHaveLength(2);
  });

  it.each([
    ['before the first lot opens', new Date('2026-11-09T23:59:00-03:00')],
    ['after the last lot closes', new Date('2027-03-21T00:00:00-03:00')],
  ])('answers 409 and creates nothing %s', async (_name, now) => {
    const { deps, store, fetchMock } = setup();
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), { ...ENV, now }, deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'no_fee_available' });
    expect(store.payments).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 409 for a category that has no fee, instead of charging a guess', async () => {
    const { deps, store } = setup();
    store.registrations.set(PAY_TOKEN, { ...REGISTRATION, category: 'PROFESSOR' });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(409);
    expect(store.payments).toHaveLength(0);
  });
});

describe('handleCreateOrder: when things go wrong halfway', () => {
  it.each([
    ['Mercado Pago answers 500', new Response('oops', { status: 500 })],
    ['Mercado Pago answers 401', answer({ code: 'invalid_credentials' }, 401)],
    ['the answer has no checkout link', answer(order({ checkout_url: undefined }), 201)],
    ['the checkout link is not https', answer(order({ checkout_url: 'javascript:alert(1)' }), 201)],
    ['the call throws', new Error('network down')],
  ])('answers 502 when %s and reuses the same payment on the retry', async (_name, failure) => {
    const { deps, store, fetchMock } = setup(failure, created());
    const failed = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(failed.status).toBe(502);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]).toMatchObject({
      status: 'CREATED',
      mpOrderId: null,
      checkoutUrl: null,
    });

    const retry = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(retry.status).toBe(201);
    expect(store.payments).toHaveLength(1);
    // Same idempotency key both times, so Mercado Pago cannot end up with two orders.
    const keys = [0, 1].map((i) =>
      new Headers(sentOrder(fetchMock, i).init?.headers).get('x-idempotency-key'),
    );
    expect(keys[0]).toBe(store.payments[0]!.id);
    expect(keys[1]).toBe(keys[0]);
  });

  it('charges the lot in force on the retry when the lot changed since the failed attempt', async () => {
    const { deps, store, fetchMock } = setup(new Response('oops', { status: 500 }), created());
    await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    const lot2 = { ...ENV, now: new Date('2027-01-05T10:00:00-03:00') };
    const retry = await handleCreateOrder(post({ token: PAY_TOKEN }), lot2, deps);
    expect(retry.status).toBe(201);
    expect(store.payments[0]).toMatchObject({ amountCents: 7000, feeTierRef: 'f5' });
    expect(sentOrder(fetchMock, 1).body.total_amount).toBe('70.00');
  });

  it('returns the order another request opened at the same moment', async () => {
    const { deps, store, fetchMock } = setup();
    const list = vi.spyOn(store, 'listPayments');
    // Our first read sees nothing; the rival's payment lands before our insert.
    list.mockImplementationOnce(async () => {
      store.seed({ mpOrderId: ORDER_ID, checkoutUrl: CHECKOUT });
      return [];
    });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(200);
    expect((await response.json()).checkoutUrl).toBe(CHECKOUT);
    expect(store.payments).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 409 when the rival request has not got its checkout link yet', async () => {
    const { deps, store } = setup();
    vi.spyOn(store, 'listPayments').mockImplementationOnce(async () => {
      store.seed();
      return [];
    });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'payment_in_progress' });
  });
});

describe('handleCreateOrder: an order older than a day', () => {
  const yesterday = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();

  it('replaces an expired unpaid order with a new one', async () => {
    const { deps, store } = setup(
      answer(order({ status: 'expired', status_detail: 'expired' })),
      answer(
        order({
          id: 'ORDTST01BBBBBBBBBBBBBBBBBBBBBBBB',
          status: 'created',
          checkout_url: `${CHECKOUT}2`,
        }),
        201,
      ),
    );
    store.seed({ mpOrderId: ORDER_ID, checkoutUrl: CHECKOUT, createdAt: yesterday });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(201);
    expect(store.payments.map((p) => p.status)).toEqual(['CANCELLED', 'CREATED']);
    expect((await response.json()).checkoutUrl).toBe(`${CHECKOUT}2`);
  });

  it('answers already paid when the old order was in fact paid and we missed the notification', async () => {
    const { deps, store, fetchMock } = setup(answer(order()));
    store.seed({ mpOrderId: ORDER_ID, checkoutUrl: CHECKOUT, createdAt: yesterday });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'already_paid' });
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]).toMatchObject({ status: 'APPROVED', paidAt: NOW.toISOString() });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels a still-payable old order at Mercado Pago before opening a new one', async () => {
    const { deps, store, fetchMock } = setup(
      answer(order({ status: 'created', status_detail: null })),
      answer(order({ status: 'canceled', status_detail: 'canceled_transaction' })),
      answer(
        order({
          id: 'ORDTST01BBBBBBBBBBBBBBBBBBBBBBBB',
          status: 'created',
          checkout_url: `${CHECKOUT}2`,
        }),
        201,
      ),
    );
    store.seed({ mpOrderId: ORDER_ID, checkoutUrl: CHECKOUT, createdAt: yesterday });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(201);
    const [cancelUrl, cancelInit] = fetchMock.mock.calls[1]!;
    expect(cancelUrl).toBe(`https://api.mercadopago.com/v1/orders/${ORDER_ID}/cancel`);
    expect(cancelInit?.method).toBe('POST');
    expect(store.payments.map((p) => p.status)).toEqual(['CANCELLED', 'CREATED']);
  });

  it('does not open a new order when the old one could not be cancelled', async () => {
    const { deps, store } = setup(
      answer(order({ status: 'created', status_detail: null })),
      answer({ code: 'cannot_cancel_order' }, 409),
    );
    store.seed({ mpOrderId: ORDER_ID, checkoutUrl: CHECKOUT, createdAt: yesterday });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(502);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]!.status).toBe('CREATED');
  });

  it('never opens a second order over a boleto or a review still pending', async () => {
    const { deps, store, fetchMock } = setup(
      answer(order({ status: 'action_required', status_detail: 'waiting_payment' })),
    );
    store.seed({
      mpOrderId: ORDER_ID,
      checkoutUrl: CHECKOUT,
      status: 'PENDING',
      createdAt: yesterday,
    });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'payment_pending' });
    expect(store.payments).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not open a second order while it cannot tell what happened to the old one', async () => {
    const { deps, store } = setup(new Response('oops', { status: 500 }));
    store.seed({ mpOrderId: ORDER_ID, checkoutUrl: CHECKOUT, createdAt: yesterday });
    const response = await handleCreateOrder(post({ token: PAY_TOKEN }), ENV, deps);
    expect(response.status).toBe(502);
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]!.status).toBe('CREATED');
  });
});
