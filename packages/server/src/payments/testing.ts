// Test helpers shared by the payment handler tests. Not imported by runtime code.
import { vi } from 'vitest';
import type { MercadoPagoOrder } from './mercadoPago';
import { OPEN_STATUSES } from './status';
import {
  OpenPaymentExistsError,
  type EmailJob,
  type NewEmail,
  type ReminderCandidate,
  type PaymentContact,
  type NewPayment,
  type Payment,
  type PaymentPatch,
  type PaymentStore,
  type PreRegistrationRef,
} from './store';

export const TOKEN = 'APP_USR-test-token';
export const PAY_TOKEN = '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10';
export const ORDER_ID = 'ORDTST01M6PCN643FNC0HP9DMKKVM8XR';
export const NOW = new Date('2026-11-12T15:00:00-03:00');

export const CONTACT: PaymentContact = {
  fullName: 'Maria Clara de Souza',
  // Not an example.com address: those are never mailed (see isSendableEmail).
  email: 'pessoa@ufcg.edu.br',
  locale: 'pt-BR',
  payToken: '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10',
  eventSlug: '2027',
  eventName: 'II SIEAmB',
};

export interface StoredEmail extends EmailJob {
  dedupeKey: string;
  createdAt: string;
  lockedUntil: number | null;
  lastError: string | null;
  sentAt: string | null;
}

export const REGISTRATION: PreRegistrationRef = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  eventId: 'bbbbbbbb-0000-4000-8000-000000000001',
  eventSlug: '2027',
  email: 'pessoa@example.com',
  category: 'ESTUDANTE_POS',
  modality: 'ONLINE',
  fullName: 'Maria Clara de Souza',
  cpf: '52998224725',
};

/** In-memory PaymentStore that enforces the same one-open-payment rule as the database. */
export class FakeStore implements PaymentStore {
  payments: Payment[] = [];
  registrations = new Map<string, PreRegistrationRef>([[PAY_TOKEN, REGISTRATION]]);
  snapshots = new Map<string, Record<string, unknown>>();
  failNextUpdate = false;
  emails: StoredEmail[] = [];
  contact: PaymentContact | null = { ...CONTACT };
  failNextEnqueue = false;
  /** The store's clock: stamps e-mails and payment updates, so tests can move time. */
  clock: Date = NOW;
  registeredAt: string = NOW.toISOString();
  touched = new Map<string, number>();
  private sequence = 0;

  seed(overrides: Partial<Payment> = {}): Payment {
    this.sequence += 1;
    const payment: Payment = {
      id: `cccccccc-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`,
      eventId: REGISTRATION.eventId,
      preRegistrationId: REGISTRATION.id,
      status: 'CREATED',
      amountCents: 5000,
      feeTierRef: 'f2',
      mpOrderId: null,
      mpStatus: null,
      mpStatusDetail: null,
      checkoutUrl: null,
      paidAt: null,
      createdAt: NOW.toISOString(),
      ...overrides,
    };
    this.payments.push(payment);
    return payment;
  }

  async findPreRegistrationByToken(token: string) {
    return this.registrations.get(token) ?? null;
  }

  async listPayments(preRegistrationId: string) {
    return this.payments
      .filter((p) => p.preRegistrationId === preRegistrationId)
      .map((p) => ({ ...p }))
      .reverse();
  }

  async findPaymentById(id: string) {
    const found = this.payments.find((p) => p.id === id);
    return found ? { ...found } : null;
  }

  async findPaymentByOrderId(orderId: string) {
    const found = this.payments.find((p) => p.mpOrderId === orderId);
    return found ? { ...found } : null;
  }

  async insertPayment(payment: NewPayment) {
    const clash = this.payments.some(
      (p) => p.preRegistrationId === payment.preRegistrationId && OPEN_STATUSES.includes(p.status),
    );
    if (clash) throw new OpenPaymentExistsError();
    return { ...this.seed({ ...payment, status: 'CREATED' }) };
  }

  async updatePayment(id: string, patch: PaymentPatch) {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error('payments_store_failed: 500');
    }
    const payment = this.payments.find((p) => p.id === id);
    if (!payment) throw new Error('payments_store_failed: update matched no row');
    const { orderSnapshot, ...columns } = patch;
    if (orderSnapshot) this.snapshots.set(id, orderSnapshot);
    this.touched.set(id, this.clock.getTime());
    for (const [key, value] of Object.entries(columns)) {
      if (value !== undefined) (payment as unknown as Record<string, unknown>)[key] = value;
    }
    return { ...payment };
  }

  // Same rules as the database: one e-mail per payment and kind, and a claim only
  // succeeds for whoever read the current attempt counter.
  async enqueueEmail(input: NewEmail) {
    if (this.failNextEnqueue) {
      this.failNextEnqueue = false;
      throw new Error('payments_store_failed: 500');
    }
    if (this.emails.some((e) => e.dedupeKey === input.dedupeKey)) return null;
    const email: StoredEmail = {
      id: `dddddddd-0000-4000-8000-${String(this.emails.length + 1).padStart(12, '0')}`,
      preRegistrationId: input.preRegistrationId,
      paymentId: input.paymentId,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      createdAt: this.clock.toISOString(),
      status: 'PENDING',
      attempts: 0,
      lockedUntil: null,
      lastError: null,
      sentAt: null,
    };
    this.emails.push(email);
    return this.job(email);
  }

  async listDueEmails(now: Date, limit: number) {
    return this.emails
      .filter(
        (e) =>
          e.status === 'PENDING' &&
          e.attempts < 6 &&
          (e.lockedUntil === null || e.lockedUntil < now.getTime()),
      )
      .slice(0, limit)
      .map((e) => this.job(e));
  }

  async claimEmail(job: EmailJob, now: Date) {
    const email = this.emails.find((e) => e.id === job.id);
    if (!email || email.status !== 'PENDING' || email.attempts !== job.attempts) return false;
    email.attempts += 1;
    email.lockedUntil = now.getTime() + 2 * 60 * 1000;
    return true;
  }

  async finishEmail(id: string, outcome: 'SENT' | 'SKIPPED', now: Date) {
    const email = this.emails.find((e) => e.id === id);
    if (!email) return;
    email.status = outcome;
    email.sentAt = outcome === 'SENT' ? now.toISOString() : null;
    email.lockedUntil = null;
    email.lastError = null;
  }

  async releaseEmail(id: string, reason: string) {
    const email = this.emails.find((e) => e.id === id);
    if (!email) return;
    email.lockedUntil = null;
    email.lastError = reason;
  }

  async findContact(_preRegistrationId: string) {
    return this.contact ? { ...this.contact } : null;
  }

  async listOpenPayments(updatedBefore: Date, limit: number) {
    return this.payments
      .filter(
        (p) =>
          OPEN_STATUSES.includes(p.status) &&
          p.mpOrderId &&
          (this.touched.get(p.id) ?? Date.parse(p.createdAt)) < updatedBefore.getTime(),
      )
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }

  async listReminderCandidates(registeredBefore: Date, _limit: number): Promise<ReminderCandidate[]> {
    if (Date.parse(this.registeredAt) >= registeredBefore.getTime()) return [];
    return this.candidate();
  }

  async listRecentRegistrations(since: Date, _limit: number): Promise<ReminderCandidate[]> {
    if (Date.parse(this.registeredAt) < since.getTime()) return [];
    return this.candidate();
  }

  private candidate(): ReminderCandidate[] {
    return [
      {
        preRegistrationId: REGISTRATION.id,
        registeredAt: this.registeredAt,
        payments: this.payments.map((p) => ({ id: p.id, status: p.status, mpStatus: p.mpStatus })),
        emails: this.emails.map((e) => ({ kind: e.kind, createdAt: e.createdAt })),
      },
    ];
  }

  private job(email: StoredEmail): EmailJob {
    return {
      id: email.id,
      preRegistrationId: email.preRegistrationId,
      paymentId: email.paymentId,
      kind: email.kind,
      status: email.status,
      attempts: email.attempts,
    };
  }
}

export function order(overrides: Partial<MercadoPagoOrder> = {}): MercadoPagoOrder {
  return {
    id: ORDER_ID,
    status: 'processed',
    status_detail: 'accredited',
    total_amount: '50.00',
    total_paid_amount: '50.00',
    checkout_url: `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${ORDER_ID}`,
    transactions: {
      payments: [
        {
          id: 'PAY01',
          status: 'processed',
          status_detail: 'accredited',
          amount: '50.00',
          paid_amount: '50.00',
          payment_method: { id: 'master', type: 'credit_card', installments: 1 },
        },
      ],
    },
    // Present in real answers; must never reach our logs or our snapshot.
    ...({ payer: { email: 'someone@example.com' } } as object),
    ...overrides,
  };
}

/** A fetch double answering every call with the given responses, in order (the last one repeats). */
export function mercadoPago(...responses: (Response | Error)[]) {
  const queue = responses.length
    ? responses
    : [new Response(JSON.stringify(order()), { status: 200 })];
  let call = 0;
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = queue[Math.min(call, queue.length - 1)]!;
    call += 1;
    if (next instanceof Error) throw next;
    return next.clone();
  });
  return fetchMock;
}

export const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
