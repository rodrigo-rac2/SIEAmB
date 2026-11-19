import { parseRows } from '../core/rest';
import type { PaymentStatus } from '../payments/status';
import {
  DocumentInUseError,
  type DocumentHolder,
  type AccountNotification,
  type AccountStore,
  type DocumentQuery,
  type EventRef,
  type LinkRequest,
  type LinkRequestStatus,
  type OwnRegistration,
  type Profile,
  type ProfilePatch,
  type RegistrationMatch,
} from './store';
import type { PersonDocument } from '../core/document';

const UNIQUE_VIOLATION = '23505';

class StoreError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`account_store_failed: ${status} ${code}`.trim());
  }
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  cpf: string | null;
  passport: string | null;
  country: string;
  institution: string | null;
}

const PROFILE_COLUMNS = 'id,email,full_name,cpf,passport,country,institution';

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  cpf: row.cpf,
  passport: row.passport,
  country: row.country,
  institution: row.institution,
});

interface MatchRow {
  id: string;
  event_id: string;
  email: string;
  full_name: string;
  locale: string;
  created_at: string;
  user_id: string | null;
  event: { slug: string; name: string } | null;
}

const MATCH_COLUMNS = 'id,event_id,email,full_name,locale,created_at,user_id,event:events(slug,name)';

const toMatch = (row: MatchRow): RegistrationMatch => ({
  id: row.id,
  eventId: row.event_id,
  eventSlug: row.event?.slug ?? '',
  eventName: row.event?.name ?? '',
  email: row.email,
  fullName: row.full_name,
  locale: row.locale,
  createdAt: row.created_at,
  userId: row.user_id,
});

interface LinkRow {
  id: string;
  pre_registration_id: string;
  user_id: string;
  status: LinkRequestStatus;
  expires_at: string;
}

const LINK_COLUMNS = 'id,pre_registration_id,user_id,status,expires_at';

const toLink = (row: LinkRow): LinkRequest => ({
  id: row.id,
  preRegistrationId: row.pre_registration_id,
  userId: row.user_id,
  status: row.status,
  expiresAt: row.expires_at,
});

const q = encodeURIComponent;

/**
 * Account storage over Supabase's REST API with the service role key.
 * Server only: this key bypasses RLS and must never reach the browser bundle.
 */
export class SupabaseAccountStore implements AccountStore {
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
        // What a call asks for itself (an upsert, no rows back) comes last and wins.
        ...init.headers,
      },
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { code?: string };
      throw new StoreError(response.status, problem.code ?? '');
    }
    return parseRows<T>(await response.text());
  }

  private async event(filter: string): Promise<EventRef | null> {
    const rows = await this.request<EventRef[]>(`events?${filter}&select=id,slug,name&limit=1`);
    return rows[0] ?? null;
  }

  findEvent(slug: string): Promise<EventRef | null> {
    return this.event(`slug=eq.${q(slug)}`);
  }

  currentEvent(): Promise<EventRef | null> {
    return this.event('is_current=is.true');
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const rows = await this.request<ProfileRow[]>(
      `users?id=eq.${q(userId)}&select=${PROFILE_COLUMNS}&limit=1`,
    );
    return rows[0] ? toProfile(rows[0]) : null;
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
    const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.fullName !== undefined) body.full_name = patch.fullName;
    if (patch.cpf !== undefined) body.cpf = patch.cpf;
    if (patch.passport !== undefined) body.passport = patch.passport;
    if (patch.country !== undefined) body.country = patch.country;
    if (patch.institution !== undefined) body.institution = patch.institution;
    try {
      const rows = await this.request<ProfileRow[]>(
        `users?id=eq.${q(userId)}&select=${PROFILE_COLUMNS}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
      if (!rows[0]) throw new StoreError(404, 'profile_not_found');
      return toProfile(rows[0]);
    } catch (error) {
      if (error instanceof StoreError && error.code === UNIQUE_VIOLATION) {
        throw new DocumentInUseError();
      }
      throw error;
    }
  }

  async findAccountsByDocument(document: PersonDocument): Promise<DocumentHolder[]> {
    const filters: string[] = [];
    if (document.cpf) filters.push(`cpf.eq.${q(document.cpf)}`);
    if (document.passport && document.country) {
      filters.push(`and(passport.eq.${q(document.passport)},country.eq.${q(document.country)})`);
    }
    if (filters.length === 0) return [];
    // At most one account per CPF and one per passport: two rows at the very most.
    return this.request<DocumentHolder[]>(
      `users?or=(${filters.join(',')})&select=id,email,cpf,passport,country&limit=5`,
    );
  }

  async saveSignupDocument(email: string, document: PersonDocument): Promise<void> {
    await this.request<unknown[]>('signup_documents?on_conflict=email&select=email', {
      method: 'POST',
      // The last request for an address replaces the one before.
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        email: email.toLowerCase(),
        cpf: document.cpf,
        passport: document.passport,
        country: document.passport ? document.country : null,
        created_at: new Date().toISOString(),
      }),
    });
  }

  async getSignupDocument(email: string): Promise<PersonDocument | null> {
    const rows = await this.request<PersonDocument[]>(
      `signup_documents?email=eq.${q(email.toLowerCase())}&select=cpf,passport,country&limit=1`,
    );
    return rows[0] ?? null;
  }

  async deleteSignupDocument(email: string): Promise<void> {
    await this.request<unknown[]>(`signup_documents?email=eq.${q(email.toLowerCase())}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  async linkRegistrationsByEmail(userId: string, email: string): Promise<number> {
    const rows = await this.request<{ id: string }[]>(
      `pre_registrations?email=eq.${q(email.toLowerCase())}&user_id=is.null&deleted_at=is.null&select=id`,
    );
    let linked = 0;
    for (const row of rows) {
      if (await this.linkRegistration(row.id, userId)) linked += 1;
    }
    return linked;
  }

  async listRegistrations(userId: string): Promise<OwnRegistration[]> {
    const rows = await this.request<
      {
        id: string;
        category: string;
        modality: string;
        created_at: string;
        pay_token: string;
        manual_status: OwnRegistration['manualStatus'];
        event: { slug: string; name: string } | null;
        payments: {
          id: string;
          status: PaymentStatus;
          mp_status: string | null;
          amount_cents: number;
          created_at: string;
        }[];
      }[]
    >(
      `pre_registrations?user_id=eq.${q(userId)}&deleted_at=is.null&select=id,category,modality,created_at,pay_token,manual_status,event:events(slug,name),payments(id,status,mp_status,amount_cents,created_at)&order=created_at.desc`,
    );
    return rows.map((row) => ({
      id: row.id,
      eventSlug: row.event?.slug ?? '',
      eventName: row.event?.name ?? '',
      category: row.category,
      modality: row.modality,
      createdAt: row.created_at,
      payToken: row.pay_token,
      manualStatus: row.manual_status,
      payments: [...row.payments]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((p) => ({
          id: p.id,
          status: p.status,
          mpStatus: p.mp_status,
          amountCents: p.amount_cents,
        })),
    }));
  }

  async findRegistrationsByDocument(
    query: DocumentQuery,
    eventId?: string,
  ): Promise<RegistrationMatch[]> {
    const filters: string[] = [];
    if (query.cpf) filters.push(`cpf.eq.${q(query.cpf)}`);
    if (query.passport && query.country) {
      filters.push(`and(passport.eq.${q(query.passport)},country.eq.${q(query.country)})`);
    }
    if (filters.length === 0) return [];
    const scope = eventId ? `&event_id=eq.${q(eventId)}` : '';
    const rows = await this.request<MatchRow[]>(
      `pre_registrations?or=(${filters.join(',')})${scope}&deleted_at=is.null&select=${MATCH_COLUMNS}&order=created_at.asc&limit=20`,
    );
    return rows.map(toMatch);
  }

  async findRegistration(id: string): Promise<RegistrationMatch | null> {
    const rows = await this.request<MatchRow[]>(
      `pre_registrations?id=eq.${q(id)}&deleted_at=is.null&select=${MATCH_COLUMNS}&limit=1`,
    );
    return rows[0] ? toMatch(rows[0]) : null;
  }

  async linkRegistration(preRegistrationId: string, userId: string): Promise<boolean> {
    try {
      // `user_id=is.null` makes this a compare-and-swap: a registration is never taken from an account.
      const rows = await this.request<{ id: string }[]>(
        `pre_registrations?id=eq.${q(preRegistrationId)}&user_id=is.null&deleted_at=is.null&select=id`,
        { method: 'PATCH', body: JSON.stringify({ user_id: userId }) },
      );
      return rows.length === 1;
    } catch (error) {
      // The account already has a registration in that event.
      if (error instanceof StoreError && error.code === UNIQUE_VIOLATION) return false;
      throw error;
    }
  }

  async insertLinkRequest(request: {
    preRegistrationId: string;
    userId: string;
    tokenHash: string;
    status: LinkRequestStatus;
    expiresAt: Date;
  }): Promise<LinkRequest> {
    const rows = await this.request<LinkRow[]>(
      `registration_link_requests?select=${LINK_COLUMNS}`,
      {
        method: 'POST',
        body: JSON.stringify({
          pre_registration_id: request.preRegistrationId,
          user_id: request.userId,
          token_hash: request.tokenHash,
          status: request.status,
          expires_at: request.expiresAt.toISOString(),
        }),
      },
    );
    return toLink(rows[0]!);
  }

  async findLinkRequestByTokenHash(tokenHash: string): Promise<LinkRequest | null> {
    const rows = await this.request<LinkRow[]>(
      `registration_link_requests?token_hash=eq.${q(tokenHash)}&select=${LINK_COLUMNS}&limit=1`,
    );
    return rows[0] ? toLink(rows[0]) : null;
  }

  async listLinkRequests(userId: string): Promise<LinkRequest[]> {
    const rows = await this.request<LinkRow[]>(
      `registration_link_requests?user_id=eq.${q(userId)}&select=${LINK_COLUMNS}&order=created_at.desc&limit=50`,
    );
    return rows.map(toLink);
  }

  async updateLinkRequest(id: string, status: LinkRequestStatus, now: Date): Promise<void> {
    await this.request<unknown[]>(`registration_link_requests?id=eq.${q(id)}&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({ status, decided_at: now.toISOString() }),
    });
  }

  async applyRoleInvites(userId: string, email: string): Promise<void> {
    const invites = await this.request<{ id: string; event_id: string; role: string; invited_by: string | null }[]>(
      `event_member_invites?email=eq.${q(email.toLowerCase())}&select=id,event_id,role,invited_by`,
    );
    for (const invite of invites) {
      try {
        await this.request<unknown[]>('event_members?select=id', {
          method: 'POST',
          body: JSON.stringify({
            id: crypto.randomUUID(),
            event_id: invite.event_id,
            user_id: userId,
            role: invite.role,
            invited_by: invite.invited_by,
          }),
        });
      } catch (error) {
        // The role is already there: the invitation is simply spent.
        if (!(error instanceof StoreError && error.code === UNIQUE_VIOLATION)) throw error;
      }
      await this.request<unknown>(`event_member_invites?id=eq.${q(invite.id)}`, { method: 'DELETE' });
    }
  }

  async listPanels(userId: string): Promise<{ platformAdmin: boolean; slugs: string[]; reviewing: string[] }> {
    const users = await this.request<{ is_platform_admin: boolean }[]>(
      `users?id=eq.${q(userId)}&select=is_platform_admin&limit=1`,
    );
    const rows = await this.request<{ role: string; event: { slug: string } | null }[]>(
      `event_members?user_id=eq.${q(userId)}&select=role,event:events(slug)`,
    );
    const slugsOf = (roles: string[]) => [
      ...new Set(rows.flatMap((r) => (r.event && roles.includes(r.role) ? [r.event.slug] : []))),
    ];
    return {
      platformAdmin: Boolean(users[0]?.is_platform_admin),
      slugs: slugsOf(['ADMIN', 'ORGANIZER']),
      // Where the person holds the Avaliador role: the site offers them the papers to review (#315).
      reviewing: slugsOf(['REVIEWER']),
    };
  }

  async listNotifications(userId: string, limit: number): Promise<AccountNotification[]> {
    const rows = await this.request<
      { id: string; kind: string; data: Record<string, unknown>; event_id: string | null; read_at: string | null; created_at: string }[]
    >(`notifications?user_id=eq.${q(userId)}&select=id,kind,data,event_id,read_at,created_at&order=created_at.desc&limit=${limit}`);
    const ids = [...new Set(rows.flatMap((r) => (r.event_id ? [r.event_id] : [])))];
    const events = ids.length
      ? await this.request<{ id: string; slug: string }[]>(`events?id=in.(${ids.map(q).join(',')})&select=id,slug`)
      : [];
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      data: row.data ?? {},
      eventSlug: events.find((e) => e.id === row.event_id)?.slug ?? null,
      readAt: row.read_at,
      createdAt: row.created_at,
    }));
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    const rows = await this.request<{ id: string }[]>(
      `notifications?user_id=eq.${q(userId)}&read_at=is.null&select=id&limit=100`,
    );
    return rows.length;
  }

  async markNotificationsRead(userId: string, now: Date): Promise<void> {
    await this.request<unknown[]>(`notifications?user_id=eq.${q(userId)}&read_at=is.null&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({ read_at: now.toISOString() }),
    });
  }

  async hitRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
    return this.request<boolean>('rpc/hit_rate_limit', {
      method: 'POST',
      body: JSON.stringify({ p_key: key, p_window_seconds: windowSeconds, p_max: max }),
    });
  }
}
