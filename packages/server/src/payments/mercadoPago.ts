const API_BASE = 'https://api.mercadopago.com';

/** Order ids look like `ORD01J49MMW3SSBK5PSV3DFR32959` (sandbox: `ORDTST…`). */
const ORDER_ID = /^ORD[A-Z0-9]{10,64}$/i;

export interface MercadoPagoOrderPayment {
  id?: string;
  status?: string;
  status_detail?: string;
  amount?: string;
  paid_amount?: string;
  payment_method?: { id?: string; type?: string; installments?: number };
}

export interface MercadoPagoOrder {
  id: string;
  status: string;
  status_detail?: string | null;
  external_reference?: string;
  total_amount?: string;
  total_paid_amount?: string;
  checkout_url?: string;
  transactions?: { payments?: MercadoPagoOrderPayment[] };
}

export function isOrderId(value: unknown): value is string {
  return typeof value === 'string' && ORDER_ID.test(value);
}

export class MercadoPagoError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MercadoPagoError';
  }
}

async function readOrder(response: Response, failure: string): Promise<MercadoPagoOrder> {
  if (!response.ok) throw new MercadoPagoError(response.status, failure);
  const order = (await response.json()) as Partial<MercadoPagoOrder>;
  if (typeof order.id !== 'string' || typeof order.status !== 'string') {
    throw new MercadoPagoError(502, 'unexpected_order_shape');
  }
  return order as MercadoPagoOrder;
}

/** Reads the order from Mercado Pago. The notification body is never trusted for the status. */
export async function fetchOrder(
  orderId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MercadoPagoOrder> {
  if (!isOrderId(orderId)) throw new MercadoPagoError(400, 'invalid_order_id');
  const response = await fetchImpl(`${API_BASE}/v1/orders/${orderId.toUpperCase()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  return readOrder(response, 'order_lookup_failed');
}

export interface NewOrder {
  /** Our payment id: sent as external reference and as the idempotency key. */
  reference: string;
  title: string;
  amount: string;
  payerEmail: string;
  returnUrl: string;
}

/** Creates a Checkout Pro order. Retrying with the same reference does not create a second one. */
export async function createOrder(
  order: NewOrder,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MercadoPagoOrder> {
  const response = await fetchImpl(`${API_BASE}/v1/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Idempotency-Key': order.reference,
    },
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'manual',
      total_amount: order.amount,
      external_reference: order.reference,
      payer: { email: order.payerEmail },
      items: [{ title: order.title, unit_price: order.amount, quantity: 1 }],
      expiration_time: 'P1D',
      config: {
        online: {
          success_url: order.returnUrl,
          failure_url: order.returnUrl,
          pending_url: order.returnUrl,
        },
      },
    }),
  });
  const created = await readOrder(response, 'order_creation_failed');
  if (typeof created.checkout_url !== 'string' || !created.checkout_url.startsWith('https://')) {
    throw new MercadoPagoError(502, 'order_without_checkout_url');
  }
  return created;
}

/** Cancels an order nobody paid, so it cannot be paid later behind a newer one. */
export async function cancelOrder(
  orderId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MercadoPagoOrder> {
  if (!isOrderId(orderId)) throw new MercadoPagoError(400, 'invalid_order_id');
  const id = orderId.toUpperCase();
  const response = await fetchImpl(`${API_BASE}/v1/orders/${id}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'X-Idempotency-Key': `cancel-${id}`,
    },
  });
  return readOrder(response, 'order_cancel_failed');
}

/** What we keep of an order: statuses and amounts, never payer data. */
export function orderSnapshot(order: MercadoPagoOrder): Record<string, unknown> {
  return {
    id: order.id,
    status: order.status,
    status_detail: order.status_detail ?? null,
    total_amount: order.total_amount ?? null,
    total_paid_amount: order.total_paid_amount ?? null,
    external_reference: order.external_reference ?? null,
    payments: (order.transactions?.payments ?? []).map((payment) => ({
      id: payment.id ?? null,
      status: payment.status ?? null,
      status_detail: payment.status_detail ?? null,
      amount: payment.amount ?? null,
      paid_amount: payment.paid_amount ?? null,
      method: payment.payment_method?.id ?? null,
      type: payment.payment_method?.type ?? null,
      installments: payment.payment_method?.installments ?? null,
    })),
  };
}
