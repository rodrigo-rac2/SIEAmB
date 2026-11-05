import { centsToAmount, resolveFeeTier, type FeeTier } from './fees';
import { json, readJsonObject, type Log } from './http';
import { MercadoPagoError, cancelOrder, createOrder, fetchOrder } from './mercadoPago';
import { OPEN_STATUSES } from './status';
import { OpenPaymentExistsError, isUuid, type Payment, type PaymentStore } from './store';
import { applyOrderToPayment } from './sync';

export interface OrdersEnv {
  accessToken?: string;
  /** The real time: order age, payment dates. */
  now: Date;
  /** The time used to pick the lot. Differs from `now` only under the non-production override. */
  feeNow?: Date;
}

export interface OrdersDeps {
  fetch: typeof fetch;
  store?: PaymentStore;
  log: Log;
  resolveFee?: (query: Parameters<typeof resolveFeeTier>[0]) => FeeTier | null;
}

/** Orders expire after one day (`P1D`); stop reusing one a little before that. */
const ORDER_REUSE_MS = 23 * 60 * 60 * 1000;

const isOpen = (payment: Payment) => OPEN_STATUSES.includes(payment.status);

const checkoutAnswer = (status: number, payment: Payment) =>
  json(status, {
    paymentId: payment.id,
    checkoutUrl: payment.checkoutUrl,
    amountCents: payment.amountCents,
  });

/**
 * `POST /api/v1/payments/orders` with `{ "token": "<pay token>" }` (#160).
 *
 * Starts, or resumes, the payment of one pre-registration and answers with the
 * Mercado Pago checkout link. The price comes from the fee table on the server.
 */
export async function handleCreateOrder(
  request: Request,
  env: OrdersEnv,
  deps: OrdersDeps,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { accessToken } = env;
  const { store } = deps;
  if (!accessToken || !store) return json(503, { error: 'payments_not_configured' });

  const { token } = await readJsonObject(request);
  if (!isUuid(token)) return json(400, { error: 'invalid_token' });

  const registration = await store.findPreRegistrationByToken(token);
  if (!registration) return json(404, { error: 'registration_not_found' });

  let payments = await store.listPayments(registration.id);
  if (payments.some((payment) => payment.status === 'APPROVED')) {
    return json(409, { error: 'already_paid' });
  }

  let open = payments.find(isOpen) ?? null;
  if (open?.mpOrderId) {
    const age = env.now.getTime() - Date.parse(open.createdAt);
    if (open.checkoutUrl && age < ORDER_REUSE_MS) return checkoutAnswer(200, open);
    // Too old to reuse: see what really happened to it before opening another one.
    try {
      const order = await fetchOrder(open.mpOrderId, accessToken, deps.fetch);
      open = await applyOrderToPayment(open, order, store, env.now);
      if (open.status === 'CREATED' && open.mpOrderId) {
        // Still payable at Mercado Pago: cancel it there first, or it could be paid behind the new one.
        const cancelled = await cancelOrder(open.mpOrderId, accessToken, deps.fetch);
        open = await applyOrderToPayment(open, cancelled, store, env.now);
        if (open.status === 'CREATED') {
          open = await store.updatePayment(open.id, { status: 'CANCELLED' });
        }
      }
    } catch (error) {
      deps.log('mp_order_refresh_failed', {
        paymentId: open.id,
        status: error instanceof MercadoPagoError ? error.status : 0,
      });
      return json(502, { error: 'order_lookup_failed' });
    }
    if (open.status === 'APPROVED') return json(409, { error: 'already_paid' });
    // A boleto waiting to be paid or a payment under review: never open a second order over it.
    if (open.status === 'PENDING') return json(409, { error: 'payment_pending' });
    open = null;
  }

  const tier = (deps.resolveFee ?? resolveFeeTier)({
    eventSlug: registration.eventSlug,
    category: registration.category,
    modality: registration.modality,
    now: env.feeNow ?? env.now,
  });
  if (!tier) {
    deps.log('mp_order_no_fee', {
      eventSlug: registration.eventSlug,
      category: registration.category,
      modality: registration.modality,
    });
    return json(409, { error: 'no_fee_available' });
  }

  let payment: Payment;
  if (open) {
    // A row left without an order by an earlier failure: reuse it at today's price.
    payment =
      open.amountCents === tier.amountCents && open.feeTierRef === tier.id
        ? open
        : await store.updatePayment(open.id, {
            amountCents: tier.amountCents,
            feeTierRef: tier.id,
          });
  } else {
    try {
      payment = await store.insertPayment({
        eventId: registration.eventId,
        preRegistrationId: registration.id,
        amountCents: tier.amountCents,
        feeTierRef: tier.id,
      });
    } catch (error) {
      if (!(error instanceof OpenPaymentExistsError)) throw error;
      // Another request opened the payment between our read and our insert.
      payments = await store.listPayments(registration.id);
      const winner = payments.find(isOpen);
      if (winner?.checkoutUrl) return checkoutAnswer(200, winner);
      return json(409, { error: 'payment_in_progress' });
    }
  }

  try {
    const order = await createOrder(
      {
        reference: payment.id,
        title: `SIEAmB ${registration.eventSlug} - inscrição`,
        amount: centsToAmount(payment.amountCents),
        payerEmail: registration.email,
        returnUrl: `${new URL(request.url).origin}/${registration.eventSlug}/inscricoes/pagamento?p=${payment.id}`,
      },
      accessToken,
      deps.fetch,
    );
    payment = await store.updatePayment(payment.id, {
      mpOrderId: order.id,
      mpStatus: order.status,
      mpStatusDetail: order.status_detail ?? null,
      checkoutUrl: order.checkout_url ?? null,
    });
  } catch (error) {
    deps.log('mp_order_creation_failed', {
      paymentId: payment.id,
      status: error instanceof MercadoPagoError ? error.status : 0,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return json(502, { error: 'order_creation_failed' });
  }

  deps.log('mp_order_created', {
    paymentId: payment.id,
    orderId: payment.mpOrderId,
    amountCents: payment.amountCents,
    feeTierRef: payment.feeTierRef,
  });
  return checkoutAnswer(201, payment);
}
