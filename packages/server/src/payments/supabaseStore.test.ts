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

  it('reads only the columns the payment needs from the pre-registration, never the CPF', async () => {
    const { store, sent } = setup([
      {
        id: 'r1',
        event_id: 'e1',
        email: 'a@b.c',
        category: 'ESTUDANTE_POS',
        modality: 'ONLINE',
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
    });
    expect(sent().url).toContain('select=id,event_id,email,category,modality,event:events(slug)');
    expect(sent().url).not.toMatch(/cpf|passport|full_name/);
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
});
