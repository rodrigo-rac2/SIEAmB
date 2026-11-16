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

/** Who to write to about a payment. Personal data: never log it. */
export interface PaymentContact {
  fullName: string;
  email: string;
  locale: string;
  payToken: string;
  eventSlug: string;
  eventName: string;
}

export type EmailKind = 'PROCESSING' | 'CONFIRMED' | 'FAILED';

/** One e-mail owed to a person about a payment (#185): a row of the outbox. */
export interface EmailJob {
  id: string;
  paymentId: string;
  kind: EmailKind;
  status: 'PENDING' | 'SENT' | 'SKIPPED';
  attempts: number;
}

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

  // E-mail outbox (#185).
  /** Records that an e-mail is owed. Null when this payment already has one of this kind. */
  enqueueEmail(paymentId: string, kind: EmailKind): Promise<EmailJob | null>;
  /** Pending e-mails nobody is working on, oldest first. */
  listDueEmails(now: Date, limit: number): Promise<EmailJob[]>;
  /**
   * Takes a pending e-mail for one delivery attempt. False when someone else took it
   * first (the attempt counter moved), so two senders never deliver the same one.
   */
  claimEmail(job: EmailJob, now: Date): Promise<boolean>;
  finishEmail(id: string, outcome: 'SENT' | 'SKIPPED', now: Date): Promise<void>;
  /** Gives a failed attempt back to the queue. `reason` is an error name, never personal data. */
  releaseEmail(id: string, reason: string): Promise<void>;
  findContact(preRegistrationId: string): Promise<PaymentContact | null>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
