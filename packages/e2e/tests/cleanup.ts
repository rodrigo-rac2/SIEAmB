/**
 * What an automated run leaves in the dev database, and how it is removed (#227).
 *
 * Every address a run creates is `e2e+<run id>-…@sieamb.org`. The teardown removes
 * everything tied to the addresses of its own run and then looks again: if anything
 * is left, the run fails. Several runs share the dev database (one per pull request),
 * so a run never touches another run's rows; rows of runs that died are removed by
 * age, by whichever run starts next.
 */
const SUPABASE_URL = process.env.SUPABASE_DEV_URL?.replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY;

/** No run lasts this long: older test rows belong to a run that died. */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export const cleanupAvailable = (): boolean => Boolean(SUPABASE_URL && SERVICE_KEY);

/** `e2e+<run id>-` for one run, `e2e+` for every run. The `+` and `*` are PostgREST's, URL-encoded. */
const pattern = (runId?: string): string => encodeURIComponent(`e2e+${runId ? `${runId}-` : ''}*@sieamb.org`);

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY!}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      Prefer: 'return=representation',
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`cleanup ${init.method ?? 'GET'} ${path.split('?')[0]}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

const list = (ids: string[]): string => ids.map(encodeURIComponent).join(',');

/** In slices: a long `in.(…)` filter does not fit in an address. */
async function each(ids: string[], work: (slice: string) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < ids.length; i += 50) await work(list(ids.slice(i, i + 50)));
}

interface Scope {
  /** One run, or every run when absent. */
  runId?: string;
  /** Only rows created before this moment. */
  olderThan?: Date;
}

interface Found {
  users: string[];
  registrations: string[];
}

async function find({ runId, olderThan }: Scope): Promise<Found> {
  const like = pattern(runId);
  const age = olderThan ? `&created_at=lt.${encodeURIComponent(olderThan.toISOString())}` : '';
  const users = await api<{ id: string }[]>(`/rest/v1/users?email=like.${like}${age}&select=id&limit=2000`);
  const userIds = users.map((u) => u.id);
  const registrations = new Set(
    (await api<{ id: string }[]>(`/rest/v1/pre_registrations?email=like.${like}${age}&select=id&limit=5000`)).map((r) => r.id),
  );
  // A registration under another address that one of these accounts took over.
  await each(userIds, async (slice) => {
    for (const row of await api<{ id: string }[]>(`/rest/v1/pre_registrations?user_id=in.(${slice})&select=id`)) registrations.add(row.id);
  });
  return { users: userIds, registrations: [...registrations] };
}

/** What is still there for the scope, by table. Empty when the cleanup did its job. */
export async function leftovers(scope: Scope): Promise<Record<string, number>> {
  const like = pattern(scope.runId);
  const age = scope.olderThan ? `&created_at=lt.${encodeURIComponent(scope.olderThan.toISOString())}` : '';
  const count = async (path: string) => (await api<unknown[]>(`/rest/v1/${path}&select=id&limit=5000`)).length;
  const found: Record<string, number> = {
    users: await count(`users?email=like.${like}${age}`),
    pre_registrations: await count(`pre_registrations?email=like.${like}${age}`),
    submission_authors: await count(`submission_authors?email=like.${like}${age}`),
    event_member_invites: await count(`event_member_invites?email=like.${like}${age}`),
    outbox_emails: await count(`outbox_emails?to_email=like.${like}${age}`),
  };
  // Accounts at the login service that have no row of ours any more would not show above.
  return Object.fromEntries(Object.entries(found).filter(([, n]) => n > 0));
}

/**
 * Removes everything the addresses of the scope own, children first. Returns what
 * it removed. Does not throw for a row that is already gone.
 */
export async function removeTestData(scope: Scope): Promise<{ users: number; registrations: number }> {
  if (!cleanupAvailable()) return { users: 0, registrations: 0 };
  const like = pattern(scope.runId);
  const age = scope.olderThan ? `&created_at=lt.${encodeURIComponent(scope.olderThan.toISOString())}` : '';
  const { users, registrations } = await find(scope);

  await each(users, async (slice) => {
    const papers = await api<{ file_path: string }[]>(`/rest/v1/submissions?user_id=in.(${slice})&select=file_path`);
    if (papers.length > 0) {
      await api('/storage/v1/object/submissions', { method: 'DELETE', body: JSON.stringify({ prefixes: papers.map((p) => p.file_path) }) }).catch(() => undefined);
    }
    // Authors go with the paper (cascade).
    await api(`/rest/v1/submissions?user_id=in.(${slice})`, { method: 'DELETE' });
    await api(`/rest/v1/event_members?user_id=in.(${slice})`, { method: 'DELETE' });
    await api(`/rest/v1/announcements?sender_id=in.(${slice})`, { method: 'DELETE' });
    await api(`/rest/v1/audit_logs?actor_id=in.(${slice})`, { method: 'DELETE' });
  });
  // A test address listed as co-author of a paper sent by someone else.
  await api(`/rest/v1/submission_authors?email=like.${like}${age}`, { method: 'DELETE' });
  await api(`/rest/v1/event_member_invites?email=like.${like}${age}`, { method: 'DELETE' });
  await api(`/rest/v1/outbox_emails?to_email=like.${like}${age}`, { method: 'DELETE' });

  await each(registrations, async (slice) => {
    // Payment e-mails and link requests go with the payment and the registration (cascade).
    await api(`/rest/v1/payments?pre_registration_id=in.(${slice})`, { method: 'DELETE' });
    await api(`/rest/v1/pre_registrations?id=in.(${slice})`, { method: 'DELETE' });
  });

  for (const id of users) {
    // The login account first; our mirror row does not go with it.
    await api(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => undefined);
  }
  await each(users, (slice) => api(`/rest/v1/users?id=in.(${slice})`, { method: 'DELETE' }));
  return { users: users.length, registrations: registrations.length };
}
