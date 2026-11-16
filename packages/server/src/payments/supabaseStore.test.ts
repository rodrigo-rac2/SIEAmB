import { describe, expect, it, vi } from 'vitest';
import { OpenPaymentExistsError } from './store';
import { SupabasePaymentStore } from './supabaseStore';

const KEY = 'service-role-key';
const ROW = {
  id: 'cccccccc-0000-4000-8000-000000000001',
  event_id: 'bbbbbbbb-0000-4000-8000-000000000001',
  pre_registration_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  status: 'CREATED',
  amount_cents: 5000,
  fee_tier_ref: 'f2',
  mp_order_id: null,
  mp_status: null,
  mp_status_detail: null,
  checkout_url: null,
  paid_at: null,
  created_at: '2026-11-12T18:00:00.000Z',
};

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
  const store = new SupabasePaymentStore(
    'https://ref.supabase.co/',
    KEY,
    fetchMock as unknown as typeof fetch,
  );
  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0]!;
    return { url: String(url), init, headers: new Headers(init?.headers) };
  };
  return { store, sent };
}

describe('SupabasePaymentStore', () => {
  it('authenticates every call with the service role key', async () => {
    const { store, sent } = setup([ROW]);
    await store.findPaymentById(ROW.id);
    expect(sent().headers.get('apikey')).toBe(KEY);
    expect(sent().headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(sent().url).toBe(
      `https://ref.supabase.co/rest/v1/payments?id=eq.${ROW.id}&select=id,event_id,pre_registration_id,status,amount_cents,fee_tier_ref,mp_order_id,mp_status,mp_status_detail,checkout_url,paid_at,created_at&limit=1`,
    );
  });

  it('reads only the columns the payment needs from the pre-registration, never the passport', async () => {
    const { store, sent } = setup([
      {
        id: 'r1',
        event_id: 'e1',
        email: 'a@b.c',
        category: 'ESTUDANTE_POS',
        modality: 'ONLINE',
        full_name: 'Maria Clara',
        cpf: '52998224725',
        event: { slug: '2027' },
      },
    ]);
    const found = await store.findPreRegistrationByToken('3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10');
    expect(found).toEqual({
      id: 'r1',
      eventId: 'e1',
      eventSlug: '2027',
      email: 'a@b.c',
      category: 'ESTUDANTE_POS',
      modality: 'ONLINE',
      fullName: 'Maria Clara',
      cpf: '52998224725',
    });
    // Name and CPF go to Mercado Pago with the order (#191); nothing else personal is read.
    expect(sent().url).toContain('select=id,event_id,email,category,modality,full_name,cpf,event:events(slug)');
    expect(sent().url).not.toMatch(/passport|institution|country/);
  });

  it('escapes a value that tries to add a filter', async () => {
    const { store, sent } = setup([]);
    expect(await store.findPaymentByOrderId('ORD1&status=eq.APPROVED')).toBeNull();
    expect(sent().url).toContain('mp_order_id=eq.ORD1%26status%3Deq.APPROVED');
  });

  it('answers null when nothing matches', async () => {
    const { store } = setup([]);
    expect(await store.findPreRegistrationByToken('x')).toBeNull();
    expect(await store.findPaymentById('x')).toBeNull();
  });

  it('inserts with snake_case columns and maps the row back', async () => {
    const { store, sent } = setup([ROW], 201);
    const payment = await store.insertPayment({
      eventId: ROW.event_id,
      preRegistrationId: ROW.pre_registration_id,
      amountCents: 5000,
      feeTierRef: 'f2',
    });
    expect(JSON.parse(String(sent().init?.body))).toEqual({
      event_id: ROW.event_id,
      pre_registration_id: ROW.pre_registration_id,
      amount_cents: 5000,
      fee_tier_ref: 'f2',
    });
    expect(sent().headers.get('prefer')).toBe('return=representation');
    expect(payment).toMatchObject({
      id: ROW.id,
      amountCents: 5000,
      status: 'CREATED',
      mpOrderId: null,
    });
  });

  it('turns the one-open-payment unique violation into OpenPaymentExistsError', async () => {
    const { store } = setup({ code: '23505', message: 'duplicate key' }, 409);
    await expect(
      store.insertPayment({
        eventId: 'e',
        preRegistrationId: 'r',
        amountCents: 1,
        feeTierRef: 'f',
      }),
    ).rejects.toBeInstanceOf(OpenPaymentExistsError);
  });

  it('patches only the given columns, plus updated_at', async () => {
    const { store, sent } = setup([{ ...ROW, status: 'APPROVED' }]);
    await store.updatePayment(ROW.id, {
      status: 'APPROVED',
      paidAt: '2026-11-12T18:05:00.000Z',
      mpOrderId: undefined,
    });
    const body = JSON.parse(String(sent().init?.body));
    expect(Object.keys(body).sort()).toEqual(['paid_at', 'status', 'updated_at']);
    expect(sent().init?.method).toBe('PATCH');
  });

  it.each([
    ['a 500 from the database', { message: 'boom' }, 500],
    ['a permission error', { code: '42501' }, 403],
  ])('throws on %s and does not leak the key in the message', async (_name, body, status) => {
    const { store } = setup(body, status);
    await expect(store.findPaymentById(ROW.id)).rejects.toThrow(/payments_store_failed/);
    await expect(store.findPaymentById(ROW.id)).rejects.not.toThrow(KEY);
  });

  it('throws when an update matches no row, instead of pretending it worked', async () => {
    const { store } = setup([]);
    await expect(store.updatePayment(ROW.id, { status: 'APPROVED' })).rejects.toThrow(
      /matched no row/,
    );
  });

  describe('e-mail outbox (#185)', () => {
    const EMAIL = {
      id: 'dddddddd-0000-4000-8000-000000000001',
      pre_registration_id: ROW.pre_registration_id,
      payment_id: ROW.id,
      kind: 'CONFIRMED',
      dedupe_key: `${ROW.id}:CONFIRMED`,
      status: 'PENDING',
      attempts: 2,
    };
    const JOB = {
      id: EMAIL.id,
      preRegistrationId: ROW.pre_registration_id,
      paymentId: ROW.id,
      kind: 'CONFIRMED',
      dedupeKey: `${ROW.id}:CONFIRMED`,
      status: 'PENDING',
      attempts: 2,
    } as const;
    const NEW = {
      preRegistrationId: ROW.pre_registration_id,
      paymentId: ROW.id,
      kind: 'CONFIRMED',
      dedupeKey: `${ROW.id}:CONFIRMED`,
    } as const;
    const NOW = new Date('2026-11-16T15:00:00.000Z');

    it('records an owed e-mail and maps the row back', async () => {
      const { store, sent } = setup([EMAIL]);
      expect(await store.enqueueEmail(NEW)).toEqual(JOB);
      expect(sent().init?.method).toBe('POST');
      expect(sent().url).toContain('/rest/v1/payment_emails?');
      expect(JSON.parse(String(sent().init?.body))).toEqual({
        pre_registration_id: ROW.pre_registration_id,
        payment_id: ROW.id,
        kind: 'CONFIRMED',
        dedupe_key: `${ROW.id}:CONFIRMED`,
      });
    });

    it('answers null, not an error, when this payment already has that e-mail', async () => {
      const { store } = setup({ code: '23505' }, 409);
      expect(await store.enqueueEmail(NEW)).toBeNull();
    });

    it('still reports the one-open-payment clash as itself', async () => {
      const { store } = setup({ code: '23505' }, 409);
      await expect(
        store.insertPayment({ eventId: ROW.event_id, preRegistrationId: ROW.pre_registration_id, amountCents: 1, feeTierRef: 'f' }),
      ).rejects.toBeInstanceOf(OpenPaymentExistsError);
    });

    it('does not hide another failure while recording an e-mail', async () => {
      const { store } = setup({ code: '42501' }, 403);
      await expect(store.enqueueEmail(NEW)).rejects.toThrow(/payments_store_failed: 403/);
    });

    it('lists pending e-mails that are unlocked and under the attempt limit, oldest first', async () => {
      const { store, sent } = setup([EMAIL]);
      expect(await store.listDueEmails(NOW, 20)).toEqual([JOB]);
      const url = decodeURIComponent(sent().url);
      expect(url).toContain('status=eq.PENDING');
      expect(url).toContain('attempts=lt.6');
      expect(url).toContain('or=(locked_until.is.null,locked_until.lt.2026-11-16T15:00:00.000Z)');
      expect(url).toContain('order=created_at.asc');
      expect(url).toContain('limit=20');
    });

    it('claims only the row whose attempt counter it read, and locks it for two minutes', async () => {
      const { store, sent } = setup([{ id: EMAIL.id }]);
      expect(await store.claimEmail(JOB, NOW)).toBe(true);
      expect(sent().url).toContain(`id=eq.${EMAIL.id}&status=eq.PENDING&attempts=eq.2`);
      expect(JSON.parse(String(sent().init?.body))).toEqual({
        attempts: 3,
        locked_until: '2026-11-16T15:02:00.000Z',
      });
    });

    it('loses the claim when someone else moved the counter first', async () => {
      const { store } = setup([]);
      expect(await store.claimEmail(JOB, NOW)).toBe(false);
    });

    it('marks an e-mail sent with its date, and a skipped one without', async () => {
      const first = setup([{ id: EMAIL.id }]);
      await first.store.finishEmail(EMAIL.id, 'SENT', NOW);
      expect(JSON.parse(String(first.sent().init?.body))).toEqual({
        status: 'SENT',
        sent_at: NOW.toISOString(),
        locked_until: null,
        last_error: null,
      });
      const second = setup([{ id: EMAIL.id }]);
      await second.store.finishEmail(EMAIL.id, 'SKIPPED', NOW);
      expect(JSON.parse(String(second.sent().init?.body))).toMatchObject({ status: 'SKIPPED', sent_at: null });
    });

    it('gives a failed attempt back with a short reason', async () => {
      const { store, sent } = setup([{ id: EMAIL.id }]);
      await store.releaseEmail(EMAIL.id, 'E'.repeat(500));
      const body = JSON.parse(String(sent().init?.body)) as { locked_until: null; last_error: string };
      expect(body.locked_until).toBeNull();
      expect(body.last_error).toHaveLength(120);
    });

    it('reads who to write to, without the CPF or the passport', async () => {
      const { store, sent } = setup([
        {
          full_name: 'Maria Clara',
          email: 'pessoa@example.com',
          locale: 'es',
          pay_token: '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10',
          category: 'PROFISSIONAL',
          modality: 'ONLINE',
          event: { slug: '2027', name: 'II SIEAmB' },
        },
      ]);
      expect(await store.findContact(ROW.pre_registration_id)).toEqual({
        fullName: 'Maria Clara',
        email: 'pessoa@example.com',
        locale: 'es',
        payToken: '3f2b8c1e-9a4d-4e7f-8b21-6c5d4e3f2a10',
        eventSlug: '2027',
        eventName: 'II SIEAmB',
        category: 'PROFISSIONAL',
        modality: 'ONLINE',
      });
      expect(sent().url).not.toMatch(/cpf|passport/);
    });

    it('records a reminder for someone who never started a payment, with no payment id', async () => {
      const { store, sent } = setup([{ ...EMAIL, payment_id: null, kind: 'REMINDER' }]);
      const job = await store.enqueueEmail({
        preRegistrationId: ROW.pre_registration_id,
        paymentId: null,
        kind: 'REMINDER',
        dedupeKey: `reminder:${ROW.pre_registration_id}:1`,
      });
      expect(job).toMatchObject({ paymentId: null, kind: 'REMINDER' });
      expect(JSON.parse(String(sent().init?.body))).toMatchObject({ payment_id: null });
    });

    it('lists open payments that have an order and were not touched lately, stalest first', async () => {
      const { store, sent } = setup([ROW]);
      await store.listOpenPayments(NOW, 20);
      const url = decodeURIComponent(sent().url);
      expect(url).toContain('status=in.(CREATED,PENDING)');
      expect(url).toContain('mp_order_id=not.is.null');
      expect(url).toContain('updated_at=lt.2026-11-16T15:00:00.000Z');
      expect(url).toContain('order=updated_at.asc');
    });

    it('reads reminder candidates with their payments and e-mails, and no personal data', async () => {
      const { store, sent } = setup([
        {
          id: ROW.pre_registration_id,
          created_at: '2026-11-10T12:00:00.000Z',
          category: 'ESTUDANTE_POS',
          modality: 'ONLINE',
          event: { slug: '2027' },
          payments: [{ id: ROW.id, status: 'PENDING', mp_status: 'action_required' }],
          payment_emails: [{ kind: 'PROCESSING', dedupe_key: 'k1', created_at: '2026-11-10T12:05:00.000Z' }],
        },
      ]);
      expect(await store.listReminderCandidates(NOW, 500)).toEqual([
        {
          preRegistrationId: ROW.pre_registration_id,
          registeredAt: '2026-11-10T12:00:00.000Z',
          eventSlug: '2027',
          category: 'ESTUDANTE_POS',
          modality: 'ONLINE',
          payments: [{ id: ROW.id, status: 'PENDING', mpStatus: 'action_required' }],
          emails: [{ kind: 'PROCESSING', dedupeKey: 'k1', createdAt: '2026-11-10T12:05:00.000Z' }],
        },
      ]);
      // `payment_emails` is the outbox table; the address column itself must not be asked for.
      expect(sent().url).not.toMatch(/[(,=]email\b|full_name|cpf|passport|pay_token/);
    });

    it('answers null for a registration that is gone', async () => {
      const { store } = setup([]);
      expect(await store.findContact(ROW.pre_registration_id)).toBeNull();
    });
  });
});
