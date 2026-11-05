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
    case 'action_required':
    case 'processing':
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
