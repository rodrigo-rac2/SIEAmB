import { orderSnapshot, type MercadoPagoOrder } from './mercadoPago';
import { mapOrderStatus } from './status';
import type { Payment, PaymentPatch, PaymentStore } from './store';

/**
 * Copies the state of a Mercado Pago order onto our payment row.
 * The order must have been read from Mercado Pago, never taken from a request.
 */
export async function applyOrderToPayment(
  payment: Payment,
  order: MercadoPagoOrder,
  store: PaymentStore,
  now: Date,
): Promise<Payment> {
  const mapped = mapOrderStatus(order.status, order.status_detail);
  const patch: PaymentPatch = {
    mpStatus: order.status,
    mpStatusDetail: order.status_detail ?? null,
    orderSnapshot: orderSnapshot(order),
  };
  if (!payment.mpOrderId) patch.mpOrderId = order.id;
  // An unknown Mercado Pago status keeps our status as it is.
  if (mapped) patch.status = mapped;
  // The first approval sets the date; a repeated notification must not move it.
  if (mapped === 'APPROVED' && !payment.paidAt) patch.paidAt = now.toISOString();
  return store.updatePayment(payment.id, patch);
}
