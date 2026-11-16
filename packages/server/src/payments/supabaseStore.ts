import {
  OpenPaymentExistsError,
  type EmailJob,
  type EmailKind,
  type NewEmail,
  type ReminderCandidate,
  type PaymentContact,
  type NewPayment,
  type Payment,
  type PaymentPatch,
  type PaymentStore,
  type PreRegistrationRef,
} from './store';
import type { PaymentStatus } from './status';

interface PaymentRow {
  id: string;
  event_id: string;
  pre_registration_id: string;
  status: PaymentStatus;
  amount_cents: number;
  fee_tier_ref: string;
  mp_order_id: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  checkout_url: string | null;
  paid_at: string | null;
  created_at: string;
}

const PAYMENT_COLUMNS =
  'id,event_id,pre_registration_id,status,amount_cents,fee_tier_ref,mp_order_id,mp_status,mp_status_detail,checkout_url,paid_at,created_at';

const UNIQUE_VIOLATION = '23505';

/** How long a delivery attempt keeps an e-mail to itself before others may retry it. */
export const EMAIL_LOCK_MS = 2 * 60 * 1000;
/** After this many failed attempts an e-mail stays in the outbox for a person to look at. */
export const EMAIL_MAX_ATTEMPTS = 6;

class DuplicateEmailError extends Error {}

interface EmailRow {
  id: string;
  pre_registration_id: string;
  payment_id: string | null;
  kind: EmailKind;
  status: EmailJob['status'];
  attempts: number;
}

const EMAIL_COLUMNS = 'id,pre_registration_id,payment_id,kind,status,attempts';

const toEmailJob = (row: EmailRow): EmailJob => ({
  id: row.id,
  preRegistrationId: row.pre_registration_id,
  paymentId: row.payment_id,
  kind: row.kind,
  status: row.status,
  attempts: row.attempts,
});

const toPayment = (row: PaymentRow): Payment => ({
  id: row.id,
  eventId: row.event_id,
  preRegistrationId: row.pre_registration_id,
  status: row.status,
  amountCents: row.amount_cents,
  feeTierRef: row.fee_tier_ref,
  mpOrderId: row.mp_order_id,
  mpStatus: row.mp_status,
  mpStatusDetail: row.mp_status_detail,
  checkoutUrl: row.checkout_url,
  paidAt: row.paid_at,
  createdAt: row.created_at,
});

const PATCH_COLUMNS: Record<keyof PaymentPatch, string> = {
  status: 'status',
  amountCents: 'amount_cents',
  feeTierRef: 'fee_tier_ref',
  mpOrderId: 'mp_order_id',
  mpStatus: 'mp_status',
  mpStatusDetail: 'mp_status_detail',
  checkoutUrl: 'checkout_url',
  paidAt: 'paid_at',
  orderSnapshot: 'order_snapshot',
};

/**
 * Payments storage over Supabase's REST API with the service role key.
 * Server only: this key bypasses RLS and must never reach the browser bundle.
 */
export class SupabasePaymentStore implements PaymentStore {
  private readonly base: string;

  constructor(
    supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.base}/${path}`, {
      ...init,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        Accept: 'application/json',
        ...(init.body
          ? { 'Content-Type': 'application/json', Prefer: 'return=representation' }
          : {}),
      },
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { code?: string };
      if (problem.code === UNIQUE_VIOLATION) {
        if (path.startsWith('payment_emails')) throw new DuplicateEmailError();
        throw new OpenPaymentExistsError();
      }
      throw new Error(`payments_store_failed: ${response.status} ${problem.code ?? ''}`.trim());
    }
    return (await response.json()) as T;
  }

  async findPreRegistrationByToken(token: string): Promise<PreRegistrationRef | null> {
    const rows = await this.request<
      {
        id: string;
        event_id: string;
        email: string;
        category: string;
        modality: string;
        event: { slug: string } | null;
      }[]
    >(
      `pre_registrations?pay_token=eq.${encodeURIComponent(token)}&select=id,event_id,email,category,modality,event:events(slug)&limit=1`,
    );
    const row = rows[0];
    if (!row?.event) return null;
    return {
      id: row.id,
      eventId: row.event_id,
      eventSlug: row.event.slug,
      email: row.email,
      category: row.category,
      modality: row.modality,
    };
  }

  async listPayments(preRegistrationId: string): Promise<Payment[]> {
    const rows = await this.request<PaymentRow[]>(
      `payments?pre_registration_id=eq.${encodeURIComponent(preRegistrationId)}&select=${PAYMENT_COLUMNS}&order=created_at.desc`,
    );
    return rows.map(toPayment);
  }

  async findPaymentById(id: string): Promise<Payment | null> {
    const rows = await this.request<PaymentRow[]>(
      `payments?id=eq.${encodeURIComponent(id)}&select=${PAYMENT_COLUMNS}&limit=1`,
    );
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async findPaymentByOrderId(orderId: string): Promise<Payment | null> {
    const rows = await this.request<PaymentRow[]>(
      `payments?mp_order_id=eq.${encodeURIComponent(orderId)}&select=${PAYMENT_COLUMNS}&limit=1`,
    );
    return rows[0] ? toPayment(rows[0]) : null;
  }

  async insertPayment(payment: NewPayment): Promise<Payment> {
    const rows = await this.request<PaymentRow[]>(`payments?select=${PAYMENT_COLUMNS}`, {
      method: 'POST',
      body: JSON.stringify({
        event_id: payment.eventId,
        pre_registration_id: payment.preRegistrationId,
        amount_cents: payment.amountCents,
        fee_tier_ref: payment.feeTierRef,
      }),
    });
    if (!rows[0]) throw new Error('payments_store_failed: insert returned no row');
    return toPayment(rows[0]);
  }

  async updatePayment(id: string, patch: PaymentPatch): Promise<Payment> {
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(patch) as [keyof PaymentPatch, unknown][]) {
      if (value !== undefined) body[PATCH_COLUMNS[key]] = value;
    }
    const rows = await this.request<PaymentRow[]>(
      `payments?id=eq.${encodeURIComponent(id)}&select=${PAYMENT_COLUMNS}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
    if (!rows[0]) throw new Error('payments_store_failed: update matched no row');
    return toPayment(rows[0]);
  }

  async enqueueEmail(email: NewEmail): Promise<EmailJob | null> {
    try {
      const rows = await this.request<EmailRow[]>(`payment_emails?select=${EMAIL_COLUMNS}`, {
        method: 'POST',
        body: JSON.stringify({
          pre_registration_id: email.preRegistrationId,
          payment_id: email.paymentId,
          kind: email.kind,
          dedupe_key: email.dedupeKey,
        }),
      });
      return rows[0] ? toEmailJob(rows[0]) : null;
    } catch (error) {
      // unique dedupe_key: this e-mail is already owed or sent.
      if (error instanceof DuplicateEmailError) return null;
      throw error;
    }
  }

  async listDueEmails(now: Date, limit: number): Promise<EmailJob[]> {
    const iso = encodeURIComponent(now.toISOString());
    const rows = await this.request<EmailRow[]>(
      `payment_emails?status=eq.PENDING&attempts=lt.${EMAIL_MAX_ATTEMPTS}&or=(locked_until.is.null,locked_until.lt.${iso})&select=${EMAIL_COLUMNS}&order=created_at.asc&limit=${limit}`,
    );
    return rows.map(toEmailJob);
  }

  async claimEmail(job: EmailJob, now: Date): Promise<boolean> {
    // Compare-and-swap on the attempt counter: of two senders reading the same row, one matches.
    const rows = await this.request<{ id: string }[]>(
      `payment_emails?id=eq.${encodeURIComponent(job.id)}&status=eq.PENDING&attempts=eq.${job.attempts}&select=id`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          attempts: job.attempts + 1,
          locked_until: new Date(now.getTime() + EMAIL_LOCK_MS).toISOString(),
        }),
      },
    );
    return rows.length === 1;
  }

  async finishEmail(id: string, outcome: 'SENT' | 'SKIPPED', now: Date): Promise<void> {
    await this.request<unknown[]>(`payment_emails?id=eq.${encodeURIComponent(id)}&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: outcome,
        sent_at: outcome === 'SENT' ? now.toISOString() : null,
        locked_until: null,
        last_error: null,
      }),
    });
  }

  async releaseEmail(id: string, reason: string): Promise<void> {
    await this.request<unknown[]>(`payment_emails?id=eq.${encodeURIComponent(id)}&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({ locked_until: null, last_error: reason.slice(0, 120) }),
    });
  }

  async findContact(preRegistrationId: string): Promise<PaymentContact | null> {
    const rows = await this.request<
      {
        full_name: string;
        email: string;
        locale: string;
        pay_token: string;
        event: { slug: string; name: string } | null;
      }[]
    >(
      `pre_registrations?id=eq.${encodeURIComponent(preRegistrationId)}&select=full_name,email,locale,pay_token,event:events(slug,name)&limit=1`,
    );
    const row = rows[0];
    if (!row?.event) return null;
    return {
      fullName: row.full_name,
      email: row.email,
      locale: row.locale,
      payToken: row.pay_token,
      eventSlug: row.event.slug,
      eventName: row.event.name,
    };
  }

  async listOpenPayments(updatedBefore: Date, limit: number): Promise<Payment[]> {
    const iso = encodeURIComponent(updatedBefore.toISOString());
    const rows = await this.request<PaymentRow[]>(
      `payments?status=in.(CREATED,PENDING)&mp_order_id=not.is.null&updated_at=lt.${iso}&select=${PAYMENT_COLUMNS}&order=updated_at.asc&limit=${limit}`,
    );
    return rows.map(toPayment);
  }

  async listReminderCandidates(
    registeredBefore: Date,
    limit: number,
  ): Promise<ReminderCandidate[]> {
    const iso = encodeURIComponent(registeredBefore.toISOString());
    const rows = await this.request<
      {
        id: string;
        created_at: string;
        payments: { id: string; status: PaymentStatus; mp_status: string | null }[];
        payment_emails: { kind: EmailKind; created_at: string }[];
      }[]
    >(
      `pre_registrations?created_at=lt.${iso}&select=id,created_at,payments(id,status,mp_status),payment_emails(kind,created_at)&order=created_at.asc&limit=${limit}`,
    );
    return rows.map((row) => ({
      preRegistrationId: row.id,
      registeredAt: row.created_at,
      payments: row.payments.map((p) => ({ id: p.id, status: p.status, mpStatus: p.mp_status })),
      emails: row.payment_emails.map((e) => ({ kind: e.kind, createdAt: e.created_at })),
    }));
  }
}
