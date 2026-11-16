export type PaymentStatus =
  'CREATED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED';

export const OPEN_STATUSES: readonly PaymentStatus[] = ['CREATED', 'PENDING'];

/**
 * Mercado Pago order status → ours. Returns null for a status we do not know,
 * so an unexpected value never silently confirms or cancels a registration.
 */
export function mapOrderStatus(status: string, statusDetail?: string | null): PaymentStatus | null {
  switch (status) {
    case 'created':
      return 'CREATED';
    case 'processed':
      // Fully credited, or credited and later refunded in part: still paid.
      return statusDetail === 'accredited' || statusDetail === 'partially_refunded'
        ? 'APPROVED'
        : null;
    // `in_review`: Mercado Pago is reviewing the payment by hand (`pending_review_manual`), seen on
    // the first real card payment. Money may still be taken, so it is pending, never "try again".
    case 'action_required':
      // `waiting_retry`: the attempt was refused (seen with `high_risk` on the first real card
      // payment, #188) and the same order waits for another try. Nothing is being processed.
      return statusDetail === 'waiting_retry' ? 'CREATED' : 'PENDING';
    case 'processing':
    case 'in_review':
      return 'PENDING';
    case 'failed':
      return 'REJECTED';
    case 'refunded':
      return 'REFUNDED';
    case 'canceled':
    case 'cancelled':
    case 'expired':
      return 'CANCELLED';
    default:
      return null;
  }
}
