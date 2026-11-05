import { describe, expect, it, vi } from 'vitest';
import { handlePaymentStatus } from './paymentStatus';
import { FakeStore, NOW, ORDER_ID, TOKEN, answer, mercadoPago, order } from './testing';

const ENV = { accessToken: TOKEN, now: NOW };
const url = (p?: string) =>
  `https://dev.sieamb.org/api/v1/payments/status${p === undefined ? '' : `?p=${encodeURIComponent(p)}`}`;

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

describe('handlePaymentStatus', () => {
  it('answers 405 to POST and 503 without configuration', async () => {
    const { deps } = setup();
    expect(
      (await handlePaymentStatus(new Request(url('x'), { method: 'POST' }), ENV, deps)).status,
    ).toBe(405);
    expect((await handlePaymentStatus(new Request(url('x')), { now: NOW }, deps)).status).toBe(503);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a uuid', 'abc'],
    ['a uuid with a filter appended', 'cccccccc-0000-4000-8000-000000000001&select=*'],
  ])('answers 400 to an id that is %s', async (_name, id) => {
    const { deps, store } = setup();
    const find = vi.spyOn(store, 'findPaymentById');
    expect((await handlePaymentStatus(new Request(url(id)), ENV, deps)).status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });

  it('answers 404 to an id nobody has', async () => {
    const { deps } = setup();
    const response = await handlePaymentStatus(
      new Request(url('cccccccc-0000-4000-8000-999999999999')),
      ENV,
      deps,
    );
    expect(response.status).toBe(404);
  });

  it('answers only the status and the amount, never personal data', async () => {
    const { deps, store, fetchMock } = setup();
    const payment = store.seed({
      status: 'APPROVED',
      mpOrderId: ORDER_ID,
      paidAt: NOW.toISOString(),
    });
    const response = await handlePaymentStatus(new Request(url(payment.id)), ENV, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'APPROVED', amountCents: 5000 });
    expect(response.headers.get('cache-control')).toBe('no-store');
    // A settled payment is not re-read from Mercado Pago.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-reads an open payment from Mercado Pago, so the page does not wait for the notification', async () => {
    const { deps, store } = setup();
    const payment = store.seed({ mpOrderId: ORDER_ID });
    const response = await handlePaymentStatus(new Request(url(payment.id)), ENV, deps);
    expect(await response.json()).toEqual({ status: 'APPROVED', amountCents: 5000 });
    expect(store.payments[0]).toMatchObject({ status: 'APPROVED', paidAt: NOW.toISOString() });
  });

  it('shows a rejected card as rejected', async () => {
    const { deps, store } = setup(
      answer(order({ status: 'failed', status_detail: 'rejected_by_issuer' })),
    );
    const payment = store.seed({ mpOrderId: ORDER_ID });
    const response = await handlePaymentStatus(new Request(url(payment.id)), ENV, deps);
    expect(await response.json()).toMatchObject({ status: 'REJECTED' });
  });

  it('answers with what it has when Mercado Pago is down', async () => {
    const { deps, store } = setup(new Error('network down'));
    const payment = store.seed({ mpOrderId: ORDER_ID });
    const response = await handlePaymentStatus(new Request(url(payment.id)), ENV, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'CREATED', amountCents: 5000 });
  });
});
