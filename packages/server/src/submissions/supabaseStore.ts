import { q, type RestClient } from '../core/rest';
import type { PersonDocument } from '../core/document';
import type { Identity } from './identity';
import type { Modality } from './rules';
import type {
  AccountRef,
  FileStorage,
  LimitCheck,
  SaveResult,
  Organiser,
  Person,
  Submission,
  SubmissionInput,
  SubmissionStatus,
  SubmissionStore,
} from './store';

interface Row {
  id: string;
  number: number;
  event_id: string;
  user_id: string;
  title: string;
  title_en: string;
  modality: Modality;
  area_ref: string;
  abstract: string;
  keywords: string[];
  keywords_en: string[];
  file_path: string;
  file_name: string;
  file_pages: number | null;
  status: SubmissionStatus;
  locale: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  submission_authors?: { position: number; full_name: string; email: string; cpf: string | null; passport: string | null; country: string | null }[];
}

const COLUMNS =
  'id,number,event_id,user_id,title,title_en,modality,area_ref,abstract,keywords,keywords_en,file_path,file_name,file_pages,status,locale,created_at,updated_at,deleted_at';
const WITH_AUTHORS = `${COLUMNS},submission_authors(position,full_name,email,cpf,passport,country)`;

const toSubmission = (row: Row): Submission => ({
  id: row.id,
  number: row.number,
  eventId: row.event_id,
  userId: row.user_id,
  title: row.title,
  titleEn: row.title_en,
  modality: row.modality,
  areaRef: row.area_ref,
  abstract: row.abstract,
  keywords: row.keywords,
  keywordsEn: row.keywords_en,
  filePath: row.file_path,
  fileName: row.file_name,
  filePages: row.file_pages,
  status: row.status,
  locale: row.locale,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  authors: (row.submission_authors ?? [])
    .map((a) => ({
      position: a.position,
      fullName: a.full_name,
      email: a.email,
      document: { cpf: a.cpf, passport: a.passport, country: a.passport ? a.country : null },
    }))
    .sort((a, b) => a.position - b.position),
});

/** A value inside PostgREST's `in.(…)`: quoted, so that a dot or a comma in it is just text. */
const quoted = (value: string): string => `"${value.replace(/["\\]/g, '')}"`;

interface AccountRow {
  id: string;
  email: string;
  cpf: string | null;
  passport: string | null;
  country: string;
}
const ACCOUNT_REF = 'id,email,cpf,passport,country';
const toAccountRef = (row: AccountRow): AccountRef => ({
  id: row.id,
  email: row.email,
  // The country column is never empty; it only says something next to a passport.
  document: { cpf: row.cpf, passport: row.passport, country: row.passport ? row.country : null },
});

/** The `or=(…)` filter for "has any of these addresses or documents"; null when there is nothing to ask by. */
function anyOf(who: Identity): string | null {
  const filters: string[] = [];
  if (who.emails.length > 0) filters.push(`email.in.(${who.emails.map(quoted).join(',')})`);
  if (who.cpfs.length > 0) filters.push(`cpf.in.(${who.cpfs.map(quoted).join(',')})`);
  for (const key of who.passports) {
    const [country, passport] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    filters.push(`and(country.eq.${quoted(country)},passport.eq.${quoted(passport)})`);
  }
  return filters.length > 0 ? `(${filters.join(',')})` : null;
}

export class SupabaseSubmissionStore implements SubmissionStore {
  constructor(private readonly rest: RestClient) {}

  async findEvent(slug: string) {
    const rows = await this.rest.request<
      { id: string; slug: string; name: string; submissions_closed_at: string | null }[]
    >(`events?slug=eq.${q(slug)}&select=id,slug,name,submissions_closed_at&limit=1`);
    const row = rows[0];
    return row ? { id: row.id, slug: row.slug, name: row.name, closedAt: row.submissions_closed_at } : null;
  }

  async listByIdentity(eventId: string, who: Identity): Promise<Submission[]> {
    const any = anyOf(who);
    if (!any) return [];
    // Only lines of papers of this edition that still stand: the join does the choosing.
    const links = await this.rest.request<{ submission_id: string }[]>(
      `submission_authors?or=${q(any)}&submissions.event_id=eq.${q(eventId)}&submissions.deleted_at=is.null&select=submission_id,submissions!inner(id)&limit=1000`,
    );
    if (links.length === 0) return [];
    const ids = [...new Set(links.map((l) => l.submission_id))].map(q).join(',');
    const rows = await this.rest.request<Row[]>(
      `submissions?id=in.(${ids})&event_id=eq.${q(eventId)}&deleted_at=is.null&select=${WITH_AUTHORS}&order=created_at.asc`,
    );
    return rows.map(toSubmission);
  }

  async findById(id: string): Promise<Submission | null> {
    const rows = await this.rest.request<Row[]>(
      `submissions?id=eq.${q(id)}&select=${WITH_AUTHORS}&limit=1`,
    );
    return rows[0] ? toSubmission(rows[0]) : null;
  }

  async listAssignedTo(eventId: string, userId: string): Promise<Submission[]> {
    const links = await this.rest.request<{ submission_id: string }[]>(
      `submission_reviewers?user_id=eq.${q(userId)}&select=submission_id&limit=1000`,
    );
    if (links.length === 0) return [];
    const ids = [...new Set(links.map((l) => l.submission_id))].map(q).join(',');
    const rows = await this.rest.request<Row[]>(
      `submissions?id=in.(${ids})&event_id=eq.${q(eventId)}&deleted_at=is.null&select=${WITH_AUTHORS}&order=number.asc`,
    );
    return rows.map(toSubmission);
  }

  async isReviewerOf(submissionId: string, userId: string): Promise<boolean> {
    const rows = await this.rest.request<{ id: string }[]>(
      `submission_reviewers?submission_id=eq.${q(submissionId)}&user_id=eq.${q(userId)}&select=id&limit=1`,
    );
    return rows.length > 0;
  }

  async searchPeople(eventId: string, query: string, limit: number): Promise<Person[]> {
    const rows = await this.rest.request<{ full_name: string; email: string; institution: string | null }[]>(
      'rpc/search_people',
      { method: 'POST', body: JSON.stringify({ p_event_id: eventId, p_query: query, p_limit: limit }) },
    );
    return rows.map((r) => ({ fullName: r.full_name, email: r.email, institution: r.institution }));
  }

  async save(
    eventId: string,
    userId: string,
    id: string | null,
    input: SubmissionInput,
    check: LimitCheck,
    now: Date,
  ): Promise<SaveResult> {
    // One call, one transaction: the limits are counted and the paper written together.
    const answer = await this.rest.request<{ id?: string; refused?: string; position?: number }>('rpc/save_submission', {
      method: 'POST',
      body: JSON.stringify({
        p_id: id,
        p_event_id: eventId,
        p_user_id: userId,
        p_fields: {
          title: input.title,
          titleEn: input.titleEn,
          modality: input.modality,
          areaRef: input.areaRef,
          abstract: input.abstract,
          keywords: input.keywords,
          keywordsEn: input.keywordsEn,
          filePath: input.filePath,
          fileName: input.fileName,
          filePages: input.filePages,
          locale: input.locale,
        },
        p_authors: input.authors.map((a, i) => ({
          position: a.position,
          fullName: a.fullName,
          email: a.email,
          cpf: a.document.cpf,
          passport: a.document.passport,
          country: a.document.passport ? a.document.country : null,
          ...check.identities[i]!,
        })),
        p_max_as_main: check.maxAsMain,
        p_max_as_coauthor: check.maxAsCoauthor,
        p_now: now.toISOString(),
      }),
    });
    if (!answer?.id) {
      const refused = answer?.refused;
      if (refused === 'too_many_as_main' || refused === 'coauthor_limit' || refused === 'submission_not_found') {
        return { refused, position: answer.position ?? null };
      }
      throw new Error('save_submission_failed');
    }
    const saved = await this.findById(answer.id);
    if (!saved) throw new Error('save_submission_failed');
    return { submission: saved };
  }

  async softDelete(id: string, userId: string, reason: string, now: Date): Promise<void> {
    await this.rest.request<unknown[]>(`submissions?id=eq.${q(id)}&deleted_at=is.null&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({
        deleted_at: now.toISOString(),
        deleted_by: userId,
        deleted_reason: reason.slice(0, 200),
      }),
    });
  }

  async listOrganisers(eventId: string): Promise<Organiser[]> {
    const rows = await this.rest.request<
      { user: { id: string; email: string; full_name: string } | null }[]
    >(
      `event_members?event_id=eq.${q(eventId)}&role=in.(ADMIN,ORGANIZER)&select=user:users(id,email,full_name)`,
    );
    const seen = new Map<string, Organiser>();
    for (const { user } of rows) {
      if (user) seen.set(user.id, { userId: user.id, email: user.email, fullName: user.full_name });
    }
    return [...seen.values()];
  }

  async isOrganiser(eventId: string, userId: string): Promise<boolean> {
    // A platform administrator stands as an administrator in every edition.
    const users = await this.rest.request<{ is_platform_admin: boolean }[]>(
      `users?id=eq.${q(userId)}&select=is_platform_admin&limit=1`,
    );
    if (users[0]?.is_platform_admin) return true;
    const rows = await this.rest.request<{ id: string }[]>(
      `event_members?event_id=eq.${q(eventId)}&user_id=eq.${q(userId)}&role=in.(ADMIN,ORGANIZER)&select=id&limit=1`,
    );
    return rows.length > 0;
  }

  async isAdmin(eventId: string, userId: string): Promise<boolean> {
    const users = await this.rest.request<{ is_platform_admin: boolean }[]>(
      `users?id=eq.${q(userId)}&select=is_platform_admin&limit=1`,
    );
    if (users[0]?.is_platform_admin) return true;
    const rows = await this.rest.request<{ id: string }[]>(
      `event_members?event_id=eq.${q(eventId)}&user_id=eq.${q(userId)}&role=eq.ADMIN&select=id&limit=1`,
    );
    return rows.length > 0;
  }

  async findAccountsByEmail(emails: string[]): Promise<AccountRef[]> {
    if (emails.length === 0) return [];
    const list = emails.map((e) => quoted(e.toLowerCase())).join(',');
    const rows = await this.rest.request<AccountRow[]>(`users?email=in.(${q(list)})&select=${ACCOUNT_REF}`);
    return rows.map(toAccountRef);
  }

  async findAccountsByDocument(documents: PersonDocument[]): Promise<AccountRef[]> {
    const any = anyOf({
      emails: [],
      cpfs: [...new Set(documents.map((d) => d.cpf).filter((c): c is string => Boolean(c)))],
      passports: [...new Set(documents.filter((d) => d.passport && d.country).map((d) => `${d.country}:${d.passport}`))],
    });
    if (!any) return [];
    const rows = await this.rest.request<AccountRow[]>(`users?or=${q(any)}&select=${ACCOUNT_REF}&limit=200`);
    return rows.map(toAccountRef);
  }
}

export const BUCKET = 'submissions';

/** The papers live in a private Supabase Storage bucket; nothing in it has a public address. */
export class SupabaseFileStorage implements FileStorage {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly rest: RestClient,
    private readonly maxBytes: number,
  ) {}

  private call(path: string, init: RequestInit = {}): Promise<Response> {
    return this.rest.fetchImpl(`${this.rest.origin}/storage/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.rest.serviceRoleKey,
        Authorization: `Bearer ${this.rest.serviceRoleKey}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  /** Creates the bucket the first time it is needed; "already exists" is the normal answer. */
  private ensureBucket(): Promise<void> {
    this.ready ??= (async () => {
      const response = await this.call('bucket', {
        method: 'POST',
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: this.maxBytes }),
      });
      if (response.ok) return;
      const text = await response.text();
      if (response.status === 409 || /already exists|Duplicate/i.test(text)) return;
      this.ready = null;
      throw new Error(`storage_bucket_failed: ${response.status}`);
    })();
    return this.ready;
  }

  /** The service answers with an unencoded address; only its token is taken from it. */
  private static tokenOf(address: string | undefined): string | null {
    const match = /[?&]token=([A-Za-z0-9._-]+)/.exec(address ?? '');
    return match ? match[1]! : null;
  }

  private static objectPath(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  async createUploadUrl(path: string): Promise<string> {
    await this.ensureBucket();
    const response = await this.call(`object/upload/sign/${BUCKET}/${SupabaseFileStorage.objectPath(path)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const answer = (await response.json().catch(() => ({}))) as { url?: string };
    const token = SupabaseFileStorage.tokenOf(answer.url);
    if (!response.ok || !token) throw new Error(`storage_upload_url_failed: ${response.status}`);
    return `${this.rest.origin}/storage/v1/object/upload/sign/${BUCKET}/${SupabaseFileStorage.objectPath(path)}?token=${token}`;
  }

  async download(path: string): Promise<Uint8Array | null> {
    const response = await this.call(`object/${BUCKET}/${SupabaseFileStorage.objectPath(path)}`);
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`storage_download_failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async createDownloadUrl(path: string, fileName: string, seconds: number): Promise<string> {
    const response = await this.call(`object/sign/${BUCKET}/${SupabaseFileStorage.objectPath(path)}`, {
      method: 'POST',
      body: JSON.stringify({ expiresIn: seconds }),
    });
    const answer = (await response.json().catch(() => ({}))) as { signedURL?: string };
    const token = SupabaseFileStorage.tokenOf(answer.signedURL);
    if (!response.ok || !token) throw new Error(`storage_download_url_failed: ${response.status}`);
    return `${this.rest.origin}/storage/v1/object/sign/${BUCKET}/${SupabaseFileStorage.objectPath(path)}?token=${token}&download=${encodeURIComponent(fileName)}`;
  }
}
