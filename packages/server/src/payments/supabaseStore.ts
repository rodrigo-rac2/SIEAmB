import {
  OpenPaymentExistsError,
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
      if (problem.code === UNIQUE_VIOLATION) throw new OpenPaymentExistsError();
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
}
