import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { renderAtEvent } from '../test/render';
import { PaymentPage } from './PaymentPage';
import { PaymentReturnPage } from './PaymentReturnPage';

const PAYMENT = 'cccccccc-0000-4000-8000-000000000001';
const TOKEN = '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10';
const returnUrl = (query: string) => `/2027/inscricoes/pagamento${query}`;

/** Answers each status call with the next body; the last one repeats. */
const stubStatus = (...bodies: [unknown, number?][]) => {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const [body, status = 200] = bodies[Math.min(call, bodies.length - 1)]!;
    call += 1;
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.stubEnv('VITE_PAYMENTS_ENABLED', 'true');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

describe('PaymentReturnPage', () => {
  it('confirms an approved payment with its amount', async () => {
    const fetchMock = stubStatus([{ status: 'APPROVED', amountCents: 5000 }]);
    renderAtEvent(returnUrl(`?p=${PAYMENT}`), <PaymentReturnPage />);
    expect(await screen.findByRole('heading', { name: 'Pagamento aprovado!' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s50,00/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Tentar novamente' })).toBeNull();
  });

  it('does not believe the status Mercado Pago puts in the address', async () => {
    stubStatus([{ status: 'REJECTED', amountCents: 5000 }]);
    renderAtEvent(
      returnUrl(`?p=${PAYMENT}&status=approved&collection_status=approved`),
      <PaymentReturnPage />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Pagamento não aprovado' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Pagamento aprovado!')).toBeNull();
  });

  it('keeps checking an open payment and shows the approval when it arrives', async () => {
    const fetchMock = stubStatus(
      [{ status: 'CREATED', amountCents: 5000 }],
      [{ status: 'PENDING', amountCents: 5000 }],
      [{ status: 'APPROVED', amountCents: 5000 }],
    );
    renderAtEvent(returnUrl(`?p=${PAYMENT}`), <PaymentReturnPage pollMs={5} />);
    expect(await screen.findByRole('heading', { name: 'Pagamento aprovado!' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops checking after the limit and offers a retry when it knows the token', async () => {
    sessionStorage.setItem('sieamb-pay-token', TOKEN);
    const fetchMock = stubStatus([{ status: 'CREATED', amountCents: 5000 }]);
    renderAtEvent(returnUrl(`?p=${PAYMENT}`), <PaymentReturnPage pollMs={5} maxPolls={2} />);
    const retry = await screen.findByRole('link', { name: 'Tentar novamente' });
    expect(retry).toHaveAttribute('href', `/2027/inscricoes/pagar?t=${TOKEN}`);
    expect(screen.getByRole('heading', { name: 'Pagamento não concluído' })).toBeInTheDocument();
    // First look plus two re-checks, then it stops.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('offers no retry link when the token is not known in this tab', async () => {
    stubStatus([{ status: 'REJECTED', amountCents: 5000 }]);
    renderAtEvent(returnUrl(`?p=${PAYMENT}`), <PaymentReturnPage />);
    expect(
      await screen.findByRole('heading', { name: 'Pagamento não aprovado' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tentar novamente' })).toBeNull();
  });

  it.each([
    ['a refund', 'REFUNDED', 'Pagamento devolvido'],
    ['a cancellation', 'CANCELLED', 'Pagamento cancelado'],
    ['a pending boleto', 'PENDING', 'Pagamento em processamento'],
  ])('shows %s', async (_name, status, heading) => {
    stubStatus([{ status, amountCents: 5000 }]);
    renderAtEvent(returnUrl(`?p=${PAYMENT}`), <PaymentReturnPage maxPolls={0} />);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it.each([
    ['no id', ''],
    ['an id that is not a uuid', '?p=abc'],
    ['a script instead of an id', '?p=%3Cscript%3Ealert(1)%3C/script%3E'],
  ])('refuses %s without calling the server', async (_name, query) => {
    const fetchMock = stubStatus([{ status: 'APPROVED', amountCents: 1 }]);
    renderAtEvent(returnUrl(query), <PaymentReturnPage />);
    expect(await screen.findByText('Este link de pagamento não é válido.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the payment does not exist', async () => {
    stubStatus([{ error: 'payment_not_found' }, 404]);
    renderAtEvent(returnUrl(`?p=${PAYMENT}`), <PaymentReturnPage />);
    expect(await screen.findByText('Não encontramos este pagamento.')).toBeInTheDocument();
  });

  it('shows a generic error, never a blank page, when the server fails', async () => {
    stubStatus([{ error: 'payments_not_configured' }, 503]);
    renderAtEvent(returnUrl(`?p=${PAYMENT}`), <PaymentReturnPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir a operação.',
    );
  });

  it('is a not-found page while payments are switched off', async () => {
    vi.stubEnv('VITE_PAYMENTS_ENABLED', 'false');
    const fetchMock = stubStatus([{ status: 'APPROVED', amountCents: 1 }]);
    renderAtEvent(returnUrl(`?p=${PAYMENT}`), <PaymentReturnPage />);
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PaymentPage', () => {
  it('offers the pay button for a valid token', async () => {
    renderAtEvent(`/2027/inscricoes/pagar?t=${TOKEN}`, <PaymentPage />);
    expect(
      await screen.findByRole('button', { name: 'Pagar com Mercado Pago' }),
    ).toBeInTheDocument();
  });

  it.each(['', '?t=', '?t=abc', '?t=pessoa%40example.com'])(
    'refuses the link "%s"',
    async (query) => {
      renderAtEvent(`/2027/inscricoes/pagar${query}`, <PaymentPage />);
      expect(await screen.findByText('Este link de pagamento não é válido.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pagar com Mercado Pago' })).toBeNull();
    },
  );

  it('is a not-found page while payments are switched off', async () => {
    vi.stubEnv('VITE_PAYMENTS_ENABLED', 'false');
    renderAtEvent(`/2027/inscricoes/pagar?t=${TOKEN}`, <PaymentPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument(),
    );
  });
});
