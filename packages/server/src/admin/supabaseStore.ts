import { RestError, UNIQUE_VIOLATION, q, type RestClient } from '../core/rest';
import type { PaymentStatus } from '../payments/status';
import {
  RegistrationExistsError,
  AccountConflictError,
  type Account,
  type AccountPatch,
  type AdminRegistration,
  type AdminStore,
  type AdminSubmission,
  type Audience,
  type Person,
  type SentAnnouncement,
  type Invite,
  type ManualStatus,
  type Member,
  type MemberRole,
  type NewRegistration,
  type PanelRole,
  type PendingLink,
  type RegistrationPatch,
} from './store';

interface RegistrationRow {
  id: string;
  event_id: string;
  full_name: string;
  email: string;
  cpf: string | null;
  passport: string | null;
  country: string;
  institution: string | null;
  category: string;
  modality: string;
  created_at: string;
  user_id: string | null;
  created_by: string | null;
  manual_status: ManualStatus | null;
  manual_reason: string | null;
  manual_by: string | null;
  manual_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_reason: string | null;
  payments?: { status: PaymentStatus; amount_cents: number; paid_at: string | null }[];
}

const REGISTRATION =
  'id,event_id,full_name,email,cpf,passport,country,institution,category,modality,created_at,user_id,created_by,manual_status,manual_reason,manual_by,manual_at,deleted_at,deleted_by,deleted_reason';
const WITH_PAYMENTS = `${REGISTRATION},payments(status,amount_cents,paid_at)`;

const toRegistration = (row: RegistrationRow): AdminRegistration => ({
  id: row.id,
  eventId: row.event_id,
  fullName: row.full_name,
  email: row.email,
  cpf: row.cpf,
  passport: row.passport,
  country: row.country,
  institution: row.institution,
  category: row.category,
  modality: row.modality,
  createdAt: row.created_at,
  userId: row.user_id,
  createdBy: row.created_by,
  manualStatus: row.manual_status,
  manualReason: row.manual_reason,
  manualBy: row.manual_by,
  manualAt: row.manual_at,
  deletedAt: row.deleted_at,
  deletedBy: row.deleted_by,
  deletedReason: row.deleted_reason,
  payments: (row.payments ?? []).map((p) => ({ status: p.status, amountCents: p.amount_cents, paidAt: p.paid_at })),
});

const PATCH: Record<keyof RegistrationPatch, string> = {
  manualStatus: 'manual_status',
  manualReason: 'manual_reason',
  manualBy: 'manual_by',
  manualAt: 'manual_at',
  deletedAt: 'deleted_at',
  deletedBy: 'deleted_by',
  deletedReason: 'deleted_reason',
};

interface LinkRow {
  id: string;
  created_at: string;
  pre_registration: { id: string; event_id: string; full_name: string; email: string; deleted_at: string | null } | null;
  user: { id: string; full_name: string; email: string } | null;
}

const LINK = 'id,created_at,pre_registration:pre_registrations(id,event_id,full_name,email,deleted_at),user:users(id,full_name,email)';

const toLink = (row: LinkRow): (PendingLink & { eventId: string }) | null =>
  row.pre_registration && row.user
    ? {
        id: row.id,
        createdAt: row.created_at,
        eventId: row.pre_registration.event_id,
        registrationId: row.pre_registration.id,
        registrationName: row.pre_registration.full_name,
        registrationEmail: row.pre_registration.email,
        registrationDeleted: Boolean(row.pre_registration.deleted_at),
        accountId: row.user.id,
        accountName: row.user.full_name,
        accountEmail: row.user.email,
      }
    : null;

const unique = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof RestError && error.code === UNIQUE_VIOLATION) throw new RegistrationExistsError();
    throw error;
  }
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_COLUMNS = 'id,email,full_name,institution,cpf,passport,country,is_platform_admin';
interface AccountRow {
  id: string;
  email: string;
  full_name: string;
  institution: string | null;
  cpf: string | null;
  passport: string | null;
  country: string;
  is_platform_admin: boolean;
}
const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  institution: row.institution,
  cpf: row.cpf,
  passport: row.passport,
  // The column is never empty; it only says something next to a passport.
  country: row.passport ? row.country : null,
  owner: row.is_platform_admin,
});

export class SupabaseAdminStore implements AdminStore {
  constructor(private readonly rest: RestClient) {}

  async findEvent(slug: string) {
    const rows = await this.rest.request<{ id: string; slug: string; name: string }[]>(
      `events?slug=eq.${q(slug)}&select=id,slug,name&limit=1`,
    );
    return rows[0] ?? null;
  }

  async roleOf(eventId: string, userId: string): Promise<PanelRole | null> {
    const users = await this.rest.request<{ is_platform_admin: boolean }[]>(
      `users?id=eq.${q(userId)}&select=is_platform_admin&limit=1`,
    );
    if (users[0]?.is_platform_admin) return 'ADMIN';
    const rows = await this.rest.request<{ role: string }[]>(
      `event_members?event_id=eq.${q(eventId)}&user_id=eq.${q(userId)}&role=in.(ADMIN,ORGANIZER)&select=role`,
    );
    if (rows.some((r) => r.role === 'ADMIN')) return 'ADMIN';
    return rows.length > 0 ? 'ORGANIZER' : null;
  }

  async listRegistrations(eventId: string): Promise<AdminRegistration[]> {
    const rows = await this.rest.request<RegistrationRow[]>(
      `pre_registrations?event_id=eq.${q(eventId)}&select=${WITH_PAYMENTS}&order=created_at.desc&limit=5000`,
    );
    return rows.map(toRegistration);
  }

  async findRegistration(id: string): Promise<AdminRegistration | null> {
    const rows = await this.rest.request<RegistrationRow[]>(
      `pre_registrations?id=eq.${q(id)}&select=${WITH_PAYMENTS}&limit=1`,
    );
    return rows[0] ? toRegistration(rows[0]) : null;
  }

  async insertRegistration(input: NewRegistration): Promise<AdminRegistration> {
    const iso = input.now.toISOString();
    const rows = await unique(() =>
      this.rest.request<RegistrationRow[]>(`pre_registrations?select=${REGISTRATION}`, {
        method: 'POST',
        body: JSON.stringify({
          event_id: input.eventId,
          full_name: input.fullName,
          email: input.email,
          cpf: input.cpf,
          passport: input.passport,
          country: input.country,
          institution: input.institution,
          category: input.category,
          modality: input.modality,
          locale: input.locale,
          // The administrator answers for the person's consent, as they registered them.
          consent_at: iso,
          created_at: iso,
          created_by: input.createdBy,
          manual_status: input.manualStatus,
          manual_reason: input.manualReason,
          manual_by: input.manualStatus ? input.createdBy : null,
          manual_at: input.manualStatus ? iso : null,
        }),
      }),
    );
    return toRegistration(rows[0]!);
  }

  async patchRegistration(id: string, patch: RegistrationPatch): Promise<void> {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch) as [keyof RegistrationPatch, unknown][]) {
      body[PATCH[key]] = value;
    }
    await unique(() =>
      this.rest.request<unknown[]>(`pre_registrations?id=eq.${q(id)}&select=id`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    );
  }

  private async readSubmissions(filter: string): Promise<(AdminSubmission & { eventId: string })[]> {
    const rows = await this.rest.request<
      {
        id: string;
        event_id: string;
        number: number;
        title: string;
        modality: string;
        area_ref: string;
        status: string;
        file_name: string;
        file_pages: number | null;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
        deleted_reason: string | null;
        submission_authors: { position: number; full_name: string; email: string }[];
        submission_reviewers: { created_at: string; user: { id: string; email: string; full_name: string } | null }[];
      }[]
    >(
      `submissions?${filter}&select=id,event_id,number,title,modality,area_ref,status,file_name,file_pages,created_at,updated_at,deleted_at,deleted_reason,submission_authors(position,full_name,email),submission_reviewers(created_at,user:users(id,email,full_name))&order=number.asc&limit=5000`,
    );
    return rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      number: row.number,
      title: row.title,
      modality: row.modality,
      areaRef: row.area_ref,
      status: row.status,
      fileName: row.file_name,
      filePages: row.file_pages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      deletedReason: row.deleted_reason,
      authors: row.submission_authors
        .map((a) => ({ position: a.position, fullName: a.full_name, email: a.email }))
        .sort((a, b) => a.position - b.position),
      reviewers: [...row.submission_reviewers]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .flatMap((r) => (r.user ? [{ userId: r.user.id, fullName: r.user.full_name, email: r.user.email }] : [])),
    }));
  }

  async submissionsClosed(eventId: string): Promise<{ closedAt: string; closedBy: string } | null> {
    const rows = await this.rest.request<
      { submissions_closed_at: string | null; submissions_closed_by: string | null }[]
    >(`events?id=eq.${q(eventId)}&select=submissions_closed_at,submissions_closed_by&limit=1`);
    const row = rows[0];
    if (!row?.submissions_closed_at) return null;
    const who = row.submissions_closed_by
      ? await this.rest.request<{ full_name: string; email: string }[]>(
          `users?id=eq.${q(row.submissions_closed_by)}&select=full_name,email&limit=1`,
        )
      : [];
    return { closedAt: row.submissions_closed_at, closedBy: who[0]?.full_name || who[0]?.email || '' };
  }

  async setSubmissionsClosed(eventId: string, closed: { at: Date; by: string } | null): Promise<boolean> {
    // Only a row in the other state is changed, so two clicks do not move the date or the name.
    const from = closed ? 'submissions_closed_at=is.null' : 'submissions_closed_at=not.is.null';
    const rows = await this.rest.request<{ id: string }[]>(`events?id=eq.${q(eventId)}&${from}&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({
        submissions_closed_at: closed ? closed.at.toISOString() : null,
        submissions_closed_by: closed ? closed.by : null,
      }),
    });
    return rows.length > 0;
  }

  listSubmissions(eventId: string): Promise<AdminSubmission[]> {
    return this.readSubmissions(`event_id=eq.${q(eventId)}`);
  }

  async findSubmission(id: string): Promise<(AdminSubmission & { eventId: string }) | null> {
    return (await this.readSubmissions(`id=eq.${q(id)}`))[0] ?? null;
  }

  async assignReviewer(submissionId: string, userId: string, by: string, now: Date): Promise<boolean> {
    try {
      await this.rest.request<unknown[]>('submission_reviewers?select=id', {
        method: 'POST',
        body: JSON.stringify({ submission_id: submissionId, user_id: userId, assigned_by: by, created_at: now.toISOString() }),
      });
      return true;
    } catch (error) {
      if (error instanceof RestError && error.code === UNIQUE_VIOLATION) return false;
      throw error;
    }
  }

  async unassignReviewer(submissionId: string, userId: string): Promise<boolean> {
    const rows = await this.rest.request<{ id: string }[]>(
      `submission_reviewers?submission_id=eq.${q(submissionId)}&user_id=eq.${q(userId)}&select=id`,
      { method: 'DELETE', headers: { Prefer: 'return=representation' } },
    );
    return rows.length > 0;
  }

  async unassignReviewerEverywhere(eventId: string, userId: string): Promise<string[]> {
    const rows = await this.rest.request<{ id: string; submission_id: string; submission: { event_id: string } | null }[]>(
      `submission_reviewers?user_id=eq.${q(userId)}&select=id,submission_id,submission:submissions(event_id)`,
    );
    const mine = rows.filter((r) => r.submission?.event_id === eventId);
    if (mine.length === 0) return [];
    await this.rest.request<unknown>(`submission_reviewers?id=in.(${mine.map((r) => q(r.id)).join(',')})`, {
      method: 'DELETE',
    });
    return mine.map((r) => r.submission_id);
  }

  async setSubmissionStatus(id: string, status: 'SUBMITTED' | 'UNDER_REVIEW', now: Date): Promise<void> {
    await this.rest.request<unknown>(`submissions?id=eq.${q(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, updated_at: now.toISOString() }),
    });
  }

  async listAccounts(): Promise<Account[]> {
    const rows = await this.rest.request<AccountRow[]>(`users?select=${ACCOUNT_COLUMNS}&order=full_name.asc,email.asc&limit=5000`);
    return rows.map(toAccount);
  }

  async findAccount(id: string): Promise<Account | null> {
    // Anything that is not an account id finds nobody, instead of an error from the database.
    if (!UUID.test(id)) return null;
    const rows = await this.rest.request<AccountRow[]>(`users?id=eq.${q(id)}&select=${ACCOUNT_COLUMNS}&limit=1`);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async updateAccount(id: string, patch: AccountPatch, now: Date): Promise<void> {
    const body: Record<string, unknown> = { updated_at: now.toISOString() };
    if (patch.fullName !== undefined) body.full_name = patch.fullName;
    if (patch.institution !== undefined) body.institution = patch.institution;
    if (patch.email !== undefined) body.email = patch.email;
    if (patch.cpf !== undefined) body.cpf = patch.cpf;
    if (patch.passport !== undefined) {
      body.passport = patch.passport;
      // Without a passport the country goes back to what the column holds for everybody else.
      body.country = patch.passport ? patch.country : 'BR';
    }
    try {
      await this.rest.request<unknown>(`users?id=eq.${q(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
    } catch (error) {
      if (error instanceof RestError && error.code === UNIQUE_VIOLATION) throw new AccountConflictError();
      throw error;
    }
  }

  async listMembers(eventId: string): Promise<Member[]> {
    const rows = await this.rest.request<
      { role: MemberRole; user: { id: string; email: string; full_name: string } | null }[]
    >(
      `event_members?event_id=eq.${q(eventId)}&role=in.(ADMIN,ORGANIZER,REVIEWER)&select=role,user:users(id,email,full_name)&order=created_at.asc`,
    );
    return rows.flatMap((row) =>
      row.user ? [{ userId: row.user.id, email: row.user.email, fullName: row.user.full_name, role: row.role }] : [],
    );
  }

  async listInvites(eventId: string): Promise<Invite[]> {
    return this.rest.request<Invite[]>(
      `event_member_invites?event_id=eq.${q(eventId)}&select=email,role&order=created_at.asc`,
    );
  }

  async findUserByEmail(email: string) {
    const rows = await this.rest.request<{ id: string; email: string; full_name: string }[]>(
      `users?email=eq.${q(email.toLowerCase())}&select=id,email,full_name&limit=1`,
    );
    return rows[0] ? { id: rows[0].id, email: rows[0].email, fullName: rows[0].full_name } : null;
  }

  /** Giving a role someone already has is not an error. */
  private async insertIgnoringDuplicate(table: string, body: Record<string, unknown>): Promise<void> {
    try {
      await this.rest.request<unknown[]>(`${table}?select=id`, { method: 'POST', body: JSON.stringify(body) });
    } catch (error) {
      if (error instanceof RestError && error.code === UNIQUE_VIOLATION) return;
      throw error;
    }
  }

  addMember(eventId: string, userId: string, role: MemberRole, by: string): Promise<void> {
    return this.insertIgnoringDuplicate('event_members', {
      id: crypto.randomUUID(),
      event_id: eventId,
      user_id: userId,
      role,
      invited_by: by,
    });
  }

  async removeMember(eventId: string, userId: string, role: MemberRole): Promise<void> {
    await this.rest.request<unknown>(
      `event_members?event_id=eq.${q(eventId)}&user_id=eq.${q(userId)}&role=eq.${role}`,
      { method: 'DELETE' },
    );
  }

  addInvite(eventId: string, email: string, role: MemberRole, by: string): Promise<void> {
    return this.insertIgnoringDuplicate('event_member_invites', { event_id: eventId, email, role, invited_by: by });
  }

  async removeInvite(eventId: string, email: string, role: MemberRole): Promise<void> {
    await this.rest.request<unknown>(
      `event_member_invites?event_id=eq.${q(eventId)}&email=eq.${q(email)}&role=eq.${role}`,
      { method: 'DELETE' },
    );
  }

  async listPendingLinks(eventId: string): Promise<PendingLink[]> {
    const rows = await this.rest.request<LinkRow[]>(
      `registration_link_requests?status=eq.NEEDS_ORGANISER&select=${LINK}&order=created_at.asc&limit=500`,
    );
    return rows.flatMap((row) => {
      const link = toLink(row);
      if (!link || link.eventId !== eventId) return [];
      return [
        {
          id: link.id,
          createdAt: link.createdAt,
          registrationId: link.registrationId,
          registrationName: link.registrationName,
          registrationEmail: link.registrationEmail,
          registrationDeleted: link.registrationDeleted,
          accountId: link.accountId,
          accountName: link.accountName,
          accountEmail: link.accountEmail,
        },
      ];
    });
  }

  async findPendingLink(id: string) {
    const rows = await this.rest.request<LinkRow[]>(
      `registration_link_requests?id=eq.${q(id)}&status=eq.NEEDS_ORGANISER&select=${LINK}&limit=1`,
    );
    return rows[0] ? toLink(rows[0]) : null;
  }

  async decideLink(id: string, status: 'CONFIRMED' | 'REJECTED', by: string, now: Date): Promise<void> {
    await this.rest.request<unknown[]>(`registration_link_requests?id=eq.${q(id)}&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({ status, decided_by: by, decided_at: now.toISOString() }),
    });
  }

  async linkRegistration(registrationId: string, userId: string): Promise<boolean> {
    try {
      const rows = await this.rest.request<{ id: string }[]>(
        `pre_registrations?id=eq.${q(registrationId)}&user_id=is.null&deleted_at=is.null&select=id`,
        { method: 'PATCH', body: JSON.stringify({ user_id: userId }) },
      );
      return rows.length === 1;
    } catch (error) {
      if (error instanceof RestError && error.code === UNIQUE_VIOLATION) return false;
      throw error;
    }
  }

  async listAudiences(eventId: string) {
    const event = `event_id=eq.${q(eventId)}`;
    const [registered, papers, members] = await Promise.all([
      this.rest.request<{ email: string; full_name: string; manual_status: string | null }[]>(
        `pre_registrations?${event}&deleted_at=is.null&select=email,full_name,manual_status&limit=5000`,
      ),
      this.rest.request<{ submission_authors: { email: string; full_name: string }[] }[]>(
        `submissions?${event}&deleted_at=is.null&select=submission_authors(email,full_name)&limit=5000`,
      ),
      this.rest.request<{ role: string; user: { email: string; full_name: string } | null }[]>(
        `event_members?${event}&role=in.(ORGANIZER,REVIEWER)&select=role,user:users(email,full_name)`,
      ),
    ]);
    const people = (rows: { email: string; full_name: string }[]): Person[] =>
      rows.map((r) => ({ email: r.email.toLowerCase(), fullName: r.full_name }));
    const byRole = (role: string) => people(members.flatMap((m) => (m.role === role && m.user ? [m.user] : [])));
    return {
      registered: people(registered.filter((r) => r.manual_status !== 'CANCELLED')),
      authors: people(papers.flatMap((p) => p.submission_authors)),
      reviewers: byRole('REVIEWER'),
      organisers: byRole('ORGANIZER'),
    };
  }

  async findAccounts(emails: string[]): Promise<{ id: string; email: string }[]> {
    const found: { id: string; email: string }[] = [];
    for (let i = 0; i < emails.length; i += 100) {
      const list = emails.slice(i, i + 100).map((e) => `"${e.replace(/["\\]/g, '')}"`).join(',');
      found.push(...(await this.rest.request<{ id: string; email: string }[]>(`users?email=in.(${q(list)})&select=id,email`)));
    }
    return found;
  }

  async insertAnnouncement(input: { eventId: string; senderId: string; audience: Audience; subject: string; body: string; recipients: string[]; now: Date }): Promise<string> {
    const rows = await this.rest.request<{ id: string }[]>('announcements?select=id', {
      method: 'POST',
      body: JSON.stringify({
        event_id: input.eventId,
        sender_id: input.senderId,
        audience: input.audience,
        subject: input.subject,
        body: input.body,
        recipients: input.recipients,
        created_at: input.now.toISOString(),
      }),
    });
    return rows[0]!.id;
  }

  async listAnnouncements(eventId: string): Promise<SentAnnouncement[]> {
    const rows = await this.rest.request<
      { id: string; audience: Audience; subject: string; body: string; recipients: string[]; sender_id: string; created_at: string }[]
    >(`announcements?event_id=eq.${q(eventId)}&select=id,audience,subject,body,recipients,sender_id,created_at&order=created_at.desc&limit=200`);
    const senders = [...new Set(rows.map((r) => r.sender_id))];
    const names = senders.length
      ? await this.rest.request<{ id: string; full_name: string; email: string }[]>(
          `users?id=in.(${senders.map(q).join(',')})&select=id,full_name,email`,
        )
      : [];
    return rows.map((row) => {
      const sender = names.find((n) => n.id === row.sender_id);
      return {
        id: row.id,
        audience: row.audience,
        subject: row.subject,
        body: row.body,
        recipients: row.recipients.length,
        senderName: sender?.full_name || sender?.email || '',
        createdAt: row.created_at,
      };
    });
  }

  async countAnnouncementsSince(senderId: string, since: Date): Promise<number> {
    const rows = await this.rest.request<{ id: string }[]>(
      `announcements?sender_id=eq.${q(senderId)}&created_at=gte.${q(since.toISOString())}&select=id&limit=100`,
    );
    return rows.length;
  }

  async audit(entry: { actorId: string; action: string; entity: string; entityId: string | null; meta: Record<string, unknown> }): Promise<void> {
    await this.rest.request<unknown[]>('audit_logs?select=id', {
      method: 'POST',
      body: JSON.stringify({
        actor_id: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entityId,
        meta: entry.meta,
      }),
    });
  }
}
