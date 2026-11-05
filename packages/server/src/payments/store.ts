import type { PaymentStatus } from './status';

export interface PreRegistrationRef {
  id: string;
  eventId: string;
  eventSlug: string;
  email: string;
  category: string;
  modality: string;
}

export interface Payment {
  id: string;
  eventId: string;
  preRegistrationId: string;
  status: PaymentStatus;
  amountCents: number;
  feeTierRef: string;
  mpOrderId: string | null;
  mpStatus: string | null;
  mpStatusDetail: string | null;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface NewPayment {
  eventId: string;
  preRegistrationId: string;
  amountCents: number;
  feeTierRef: string;
}

export type PaymentPatch = Partial<
  Pick<
    Payment,
    | 'status'
    | 'amountCents'
    | 'feeTierRef'
    | 'mpOrderId'
    | 'mpStatus'
    | 'mpStatusDetail'
    | 'checkoutUrl'
    | 'paidAt'
  >
> & { orderSnapshot?: Record<string, unknown> };

/** Thrown by insertPayment when the pre-registration already has an open payment. */
export class OpenPaymentExistsError extends Error {
  constructor() {
    super('open_payment_exists');
    this.name = 'OpenPaymentExistsError';
  }
}

export interface PaymentStore {
  findPreRegistrationByToken(token: string): Promise<PreRegistrationRef | null>;
  listPayments(preRegistrationId: string): Promise<Payment[]>;
  findPaymentById(id: string): Promise<Payment | null>;
  findPaymentByOrderId(orderId: string): Promise<Payment | null>;
  insertPayment(payment: NewPayment): Promise<Payment>;
  updatePayment(id: string, patch: PaymentPatch): Promise<Payment>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
