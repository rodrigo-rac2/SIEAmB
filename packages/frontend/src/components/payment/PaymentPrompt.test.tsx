import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { recallPayToken } from '../../services/payments';
import { PaymentPrompt } from './PaymentPrompt';

const TOKEN = '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10';
const CHECKOUT = 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDTST01';
const started = {
  paymentId: 'cccccccc-0000-4000-8000-000000000001',
  checkoutUrl: CHECKOUT,
  amountCents: 5000,
};

const stubFetch = (body: unknown, status = 200) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('PaymentPrompt', () => {
  it('sends the person to the Mercado Pago checkout and remembers the token for a retry', async () => {
    stubFetch(started, 201);
    const goTo = vi.fn();
    render(<PaymentPrompt token={TOKEN} goTo={goTo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pagar com Mercado Pago' }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(CHECKOUT));
    expect(recallPayToken()).toBe(TOKEN);
  });

  it('asks the server once, however many times the button is clicked while leaving', async () => {
    const fetchMock = stubFetch(started, 201);
    const goTo = vi.fn();
    render(<PaymentPrompt token={TOKEN} goTo={goTo} />);
    const button = screen.getByRole('button', { name: 'Pagar com Mercado Pago' });
    await userEvent.click(button);
    await waitFor(() => expect(goTo).toHaveBeenCalledTimes(1));
    const leaving = screen.getByRole('button', { name: 'Abrindo o Mercado Pago…' });
    expect(leaving).toBeDisabled();
    await userEvent.click(leaving);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['already_paid', 409, 'Esta inscrição já está paga.'],
    [
      'no_fee_available',
      409,
      'O pagamento ainda não está disponível para esta categoria nesta data.',
    ],
    ['payment_pending', 409, /Já existe um pagamento em processamento/],
    ['registration_not_found', 404, 'Não encontramos esta inscrição. Confira o link.'],
    [
      'order_creation_failed',
      502,
      'Não foi possível concluir a operação. Tente novamente em instantes.',
    ],
  ])(
    'shows a message for %s, goes nowhere and lets the person try again',
    async (code, status, message) => {
      stubFetch({ error: code }, status);
      const goTo = vi.fn();
      render(<PaymentPrompt token={TOKEN} goTo={goTo} />);
      await userEvent.click(screen.getByRole('button', { name: 'Pagar com Mercado Pago' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(goTo).not.toHaveBeenCalled();
      expect(recallPayToken()).toBeNull();
      expect(screen.getByRole('button', { name: 'Pagar com Mercado Pago' })).toBeEnabled();
    },
  );

  it('never follows a checkout link that is not Mercado Pago', async () => {
    stubFetch({ ...started, checkoutUrl: 'https://evil.example/pay' }, 201);
    const goTo = vi.fn();
    render(<PaymentPrompt token={TOKEN} goTo={goTo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pagar com Mercado Pago' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(goTo).not.toHaveBeenCalled();
  });
});
