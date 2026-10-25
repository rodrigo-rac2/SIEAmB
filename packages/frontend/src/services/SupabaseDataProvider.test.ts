import { describe, expect, it, vi } from 'vitest';
import type { RegistrationInput } from '@sieamb/shared';
import { DuplicateRegistrationError } from './DataProvider';
import {
  RegistrationClosedError,
  SupabaseDataProvider,
  type PreRegistrationClient,
} from './SupabaseDataProvider';

const input: RegistrationInput = {
  fullName: 'Maria da Silva Santos',
  email: 'Maria@Example.com',
  cpf: '52998224725',
  country: 'BR',
  institution: 'UFCG',
  category: 'ESTUDANTE_POS',
  modality: 'ONLINE',
  locale: 'pt-BR',
};

interface Fake {
  client: PreRegistrationClient;
  insert: ReturnType<typeof vi.fn>;
  eventLookups: ReturnType<typeof vi.fn>;
}

function fakeClient(
  opts: { insertError?: { code: string; message: string }; eventRow?: { id: string } | null } = {},
): Fake {
  const insert = vi.fn().mockResolvedValue({ error: opts.insertError ?? null });
  const eventLookups = vi
    .fn()
    .mockResolvedValue({
      data: opts.eventRow === undefined ? { id: 'db-uuid-2027' } : opts.eventRow,
      error: null,
    });
  const client = {
    from: (table: string) => {
      if (table === 'pre_registrations') return { insert };
      if (table === 'events')
        return { select: () => ({ eq: () => ({ maybeSingle: eventLookups }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as PreRegistrationClient;
  return { client, insert, eventLookups };
}

describe('SupabaseDataProvider.createRegistration', () => {
  it('inserts the pre-registration against the database event id with a lower-cased e-mail', async () => {
    const fake = fakeClient();
    const provider = new SupabaseDataProvider(fake.client);
    const result = await provider.createRegistration('evt-2027', input);

    expect(fake.insert).toHaveBeenCalledTimes(1);
    const row = fake.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).toMatchObject({
      event_id: 'db-uuid-2027',
      full_name: input.fullName,
      email: 'maria@example.com',
      cpf: '52998224725',
      passport: null,
      country: 'BR',
      institution: 'UFCG',
      category: 'ESTUDANTE_POS',
      modality: 'ONLINE',
      locale: 'pt-BR',
    });
    expect(typeof row.consent_at).toBe('string');
    expect(row).not.toHaveProperty('id'); // the database generates it
    expect(result.status).toBe('PENDING_PAYMENT');
  });

  it('resolves the event id once per fixture id', async () => {
    const fake = fakeClient();
    const provider = new SupabaseDataProvider(fake.client);
    await provider.createRegistration('evt-2027', input);
    await provider.createRegistration('evt-2027', { ...input, email: 'other@example.com' });
    expect(fake.eventLookups).toHaveBeenCalledTimes(1);
  });

  it('maps the unique violation to DuplicateRegistrationError', async () => {
    const fake = fakeClient({ insertError: { code: '23505', message: 'duplicate key' } });
    await expect(
      new SupabaseDataProvider(fake.client).createRegistration('evt-2027', input),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError);
  });

  it('maps the RLS violation (event not open) to RegistrationClosedError', async () => {
    const fake = fakeClient({ insertError: { code: '42501', message: 'row-level security' } });
    await expect(
      new SupabaseDataProvider(fake.client).createRegistration('evt-2027', input),
    ).rejects.toBeInstanceOf(RegistrationClosedError);
  });

  it('fails (never fakes success) on any other database error', async () => {
    const fake = fakeClient({
      insertError: { code: '23502', message: 'null value in column "id"' },
    });
    await expect(
      new SupabaseDataProvider(fake.client).createRegistration('evt-2027', input),
    ).rejects.toThrow(/pre_registration_failed: 23502/);
  });

  it('fails when the event is missing from the database and does not cache the miss', async () => {
    const fake = fakeClient({ eventRow: null });
    const provider = new SupabaseDataProvider(fake.client);
    await expect(provider.createRegistration('evt-2027', input)).rejects.toThrow(
      /event_not_in_database: 2027/,
    );
    await expect(provider.createRegistration('evt-2027', input)).rejects.toThrow(
      /event_not_in_database/,
    );
    expect(fake.eventLookups).toHaveBeenCalledTimes(2);
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it('rejects an unknown fixture event before touching the database', async () => {
    const fake = fakeClient();
    await expect(
      new SupabaseDataProvider(fake.client).createRegistration('evt-1999', input),
    ).rejects.toThrow(/unknown_event/);
    expect(fake.insert).not.toHaveBeenCalled();
  });
});
