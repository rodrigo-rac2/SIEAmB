import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Registration, RegistrationInput } from '@sieamb/shared';
import { DuplicateRegistrationError, type DataProvider } from './DataProvider';
import { StaticDataProvider } from './StaticDataProvider';

/** The subset of the Supabase client this provider touches, so tests can fake it. */
export type PreRegistrationClient = Pick<SupabaseClient, 'from'>;

/** Postgres error codes surfaced by PostgREST. */
const UNIQUE_VIOLATION = '23505';
const RLS_VIOLATION = '42501';

export class RegistrationClosedError extends Error {
  constructor() {
    super('registration_closed');
    this.name = 'RegistrationClosedError';
  }
}

/**
 * Pre-registration persistence (#149). Public content still comes from the
 * fixtures; only createRegistration talks to Supabase, as an anonymous
 * insert-only write into pre_registrations (RLS forbids reads with the anon key).
 */
export class SupabaseDataProvider extends StaticDataProvider implements DataProvider {
  private readonly eventIds = new Map<string, Promise<string>>();

  constructor(private readonly client: PreRegistrationClient) {
    super();
  }

  /** Returns null when the env lacks the Supabase URL/key, so the factory can fail loudly. */
  static fromEnv(): SupabaseDataProvider | null {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return new SupabaseDataProvider(createClient(url, key, { auth: { persistSession: false } }));
  }

  override async createRegistration(
    eventId: string,
    input: RegistrationInput,
  ): Promise<Registration> {
    const dbEventId = await this.resolveEventId(eventId);
    const now = new Date().toISOString();
    const { error } = await this.client.from('pre_registrations').insert({
      event_id: dbEventId,
      full_name: input.fullName,
      email: input.email.trim().toLowerCase(),
      cpf: input.cpf ?? null,
      passport: input.passport ?? null,
      country: input.country,
      institution: input.institution ?? null,
      category: input.category,
      modality: input.modality,
      locale: input.locale,
      consent_at: now,
    });
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new DuplicateRegistrationError();
      if (error.code === RLS_VIOLATION) throw new RegistrationClosedError();
      throw new Error(`pre_registration_failed: ${error.code ?? 'unknown'} ${error.message}`);
    }
    // The anon role cannot read the row back (by design), so the id is not known here.
    return {
      id: 'pending',
      eventId,
      userId: '',
      category: input.category,
      modality: input.modality,
      status: 'PENDING_PAYMENT',
      createdAt: now,
    };
  }

  /** Fixture ids ("evt-2027") differ from the database uuids; the slug is the shared key. */
  private resolveEventId(fixtureEventId: string): Promise<string> {
    let pending = this.eventIds.get(fixtureEventId);
    if (!pending) {
      pending = this.lookupEventId(fixtureEventId).catch((err: unknown) => {
        this.eventIds.delete(fixtureEventId); // do not cache a failure
        throw err;
      });
      this.eventIds.set(fixtureEventId, pending);
    }
    return pending;
  }

  private async lookupEventId(fixtureEventId: string): Promise<string> {
    const event = (await this.getEvents()).find((e) => e.id === fixtureEventId);
    if (!event) throw new Error(`unknown_event: ${fixtureEventId}`);
    const { data, error } = await this.client
      .from('events')
      .select('id')
      .eq('slug', event.slug)
      .maybeSingle<{ id: string }>();
    if (error) throw new Error(`event_lookup_failed: ${error.code ?? 'unknown'} ${error.message}`);
    if (!data) throw new Error(`event_not_in_database: ${event.slug}`);
    return data.id;
  }
}
