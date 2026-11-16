import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PaymentError,
  formatBRL,
  getPaymentStatus,
  isCheckoutUrl,
  paymentsEnabled,
  recallPayToken,
  rememberPayToken,
  startPayment,
} from './payments';

const TOKEN = '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10';
const PAYMENT = 'cccccccc-0000-4000-8000-000000000001';
const CHECKOUT = 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDTST01';

const answering = (body: unknown, status = 200) =>
  vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    typeof body === 'string'
      ? new Response(body, { status })
      : new Response(JSON.stringify(body), { status }),
  );

afterEach(() => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe('paymentsEnabled', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['TRUE', false],
    ['1', false],
    ['', false],
  ])('VITE_PAYMENTS_ENABLED="%s" → %s', (value, expected) => {
    vi.stubEnv('VITE_PAYMENTS_ENABLED', value);
    expect(paymentsEnabled()).toBe(expected);
  });
});

describe('isCheckoutUrl', () => {
  it.each([
    CHECKOUT,
    'https://mercadopago.com.br/checkout/x',
    'https://sandbox.mercadopago.com.br/checkout/x',
    'https://www.mercadopago.com/checkout/x',
  ])('accepts %s', (url) => {
    expect(isCheckoutUrl(url)).toBe(true);
  });

  it.each([
    'http://www.mercadopago.com.br/checkout/x',
    'javascript:alert(1)',
    'https://www.mercadopago.com.br.evil.example/checkout',
    'https://evil.example/www.mercadopago.com.br',
    'https://evilmercadopago.com.br/checkout',
    '//www.mercadopago.com.br/checkout',
    '/2027/',
    '',
    null,
    42,
  ])('refuses %s', (url) => {
    expect(isCheckoutUrl(url)).toBe(false);
  });
});

describe('startPayment', () => {
  it('posts only the token and returns the checkout link', async () => {
    const fetchMock = answering(
      { paymentId: PAYMENT, checkoutUrl: CHECKOUT, amountCents: 5000 },
      201,
    );
    const started = await startPayment(TOKEN, fetchMock as unknown as typeof fetch);
    expect(started).toEqual({ paymentId: PAYMENT, checkoutUrl: CHECKOUT, amountCents: 5000 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/payments/orders');
    expect(init?.method).toBe('POST');
    // No amount, category or e-mail: the server decides the price.
    expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN });
  });

  it.each([
    ['already_paid', 409],
    ['no_fee_available', 409],
    ['payment_pending', 409],
    ['registration_not_found', 404],
  ])('turns the server error %s into a PaymentError with that code', async (code, status) => {
    const fetchMock = answering({ error: code }, status);
    await expect(startPayment(TOKEN, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      code,
    });
  });

  it.each([
    ['an unknown error code', { error: 'order_creation_failed' }, 502],
    ['an HTML error page', '<html>502</html>', 502],
    ['a success without a checkout link', { paymentId: PAYMENT }, 201],
    [
      'a checkout link on another site',
      { paymentId: PAYMENT, checkoutUrl: 'https://evil.example/pay' },
      201,
    ],
    [
      'a javascript: checkout link',
      { paymentId: PAYMENT, checkoutUrl: 'javascript:alert(1)' },
      201,
    ],
    ['a payment id that is not a uuid', { paymentId: 'x', checkoutUrl: CHECKOUT }, 201],
  ])('fails with the generic code on %s', async (_name, body, status) => {
    const fetchMock = answering(body, status);
    const failure = startPayment(TOKEN, fetchMock as unknown as typeof fetch);
    await expect(failure).rejects.toBeInstanceOf(PaymentError);
    await expect(failure).rejects.toMatchObject({ code: 'generic' });
  });

  it('fails with the generic code when the network is down', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(startPayment(TOKEN, fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      code: 'generic',
    });
  });
});

describe('getPaymentStatus', () => {
  it('reads the status by payment id', async () => {
    const fetchMock = answering({ status: 'APPROVED', amountCents: 5000 });
    expect(await getPaymentStatus(PAYMENT, fetchMock as unknown as typeof fetch)).toEqual({
      status: 'APPROVED',
      amountCents: 5000,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/payments/status?p=${PAYMENT}`);
  });

  it.each([
    ['a status it does not know', { status: 'PAID' }, 200, 'generic'],
    ['no status', {}, 200, 'generic'],
    ['an unknown payment', { error: 'payment_not_found' }, 404, 'payment_not_found'],
    ['a server error', { error: 'payments_not_configured' }, 503, 'generic'],
  ])('fails on %s', async (_name, body, status, code) => {
    const fetchMock = answering(body, status);
    await expect(
      getPaymentStatus(PAYMENT, fetchMock as unknown as typeof fetch),
    ).rejects.toMatchObject({ code });
  });
});

describe('pay token memory', () => {
  it('remembers a token for the tab', () => {
    rememberPayToken(TOKEN);
    expect(recallPayToken()).toBe(TOKEN);
  });

  it('ignores anything in storage that is not a token', () => {
    sessionStorage.setItem('sieamb-pay-token', '"><script>');
    expect(recallPayToken()).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => rememberPayToken(TOKEN)).not.toThrow();
    blocked.mockRestore();
  });
});

describe('formatBRL', () => {
  it('formats centavos as reais', () => {
    expect(formatBRL(5000, 'pt-BR').replace(/\s/g, ' ')).toBe('R$ 50,00');
    expect(formatBRL(3050, 'pt-BR').replace(/\s/g, ' ')).toBe('R$ 30,50');
  });
});
