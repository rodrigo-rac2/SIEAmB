const API_BASE = 'https://api.mercadopago.com';

/** Order ids look like `ORD01J49MMW3SSBK5PSV3DFR32959` (sandbox: `ORDTST…`). */
const ORDER_ID = /^ORD[A-Z0-9]{10,64}$/i;

export interface MercadoPagoOrder {
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  total_amount?: string;
  total_paid_amount?: string;
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
  if (!response.ok) throw new MercadoPagoError(response.status, 'order_lookup_failed');
  const order = (await response.json()) as Partial<MercadoPagoOrder>;
  if (typeof order.id !== 'string' || typeof order.status !== 'string') {
    throw new MercadoPagoError(502, 'unexpected_order_shape');
  }
  return order as MercadoPagoOrder;
}
